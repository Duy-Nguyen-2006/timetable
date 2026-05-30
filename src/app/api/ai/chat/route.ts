import { NextResponse } from 'next/server';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatPayload = {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  messages?: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: Record<string, unknown>;
  cache_control?: Record<string, unknown>;
};

function isAnthropicModel(model: string): boolean {
  return model.toLowerCase().startsWith('anthropic/');
}

function applyProviderSpecificCaching(
  model: string,
  messages: ChatMessage[],
  cacheEnabled: boolean
): Array<ChatMessage | (ChatMessage & { cache_control: { type: 'ephemeral' } })> {
  if (!cacheEnabled || !isAnthropicModel(model)) return messages;
  return messages.map((message, index) =>
    index <= 1 ? { ...message, cache_control: { type: 'ephemeral' } } : message
  );
}

function providerHeaders(model: string, cacheEnabled: boolean): Record<string, string> | undefined {
  if (!cacheEnabled || !isAnthropicModel(model)) return undefined;
  return { 'anthropic-beta': 'prompt-caching-2024-07-31' };
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text;
        }
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/u, '');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractErrorMessage(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;

  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error.trim();
  }

  const errorRecord = asRecord(record.error);
  if (errorRecord && typeof errorRecord.message === 'string' && errorRecord.message.trim()) {
    return errorRecord.message.trim();
  }

  return null;
}

function extractResponseContent(payload: unknown): { content: string; usage: Record<string, unknown> | null } {
  const record = asRecord(payload);
  if (!record) return { content: '', usage: null };

  const choices = Array.isArray(record.choices) ? record.choices : [];
  let content = '';

  for (const choice of choices) {
    const choiceRecord = asRecord(choice);
    if (!choiceRecord) continue;

    const message = asRecord(choiceRecord.message);
    const normalizedMessage = normalizeContent(message?.content);
    if (normalizedMessage) {
      content = normalizedMessage;
      break;
    }

    const delta = asRecord(choiceRecord.delta);
    const deltaText = typeof delta?.content === 'string' ? delta.content : '';
    if (deltaText) content += deltaText;

    if (!content && typeof choiceRecord.text === 'string') {
      content = choiceRecord.text;
    }
  }

  const usage = asRecord(record.usage);
  return { content, usage };
}

function parseSsePayload(raw: string): { content: string; usage: Record<string, unknown> | null } | null {
  const lines = raw.split(/\r?\n/u);
  let sawDataLine = false;
  let content = '';
  let usage: Record<string, unknown> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    sawDataLine = true;

    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') continue;

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }

    const providerError = extractErrorMessage(parsed);
    if (providerError) {
      throw new Error(providerError);
    }

    const extracted = extractResponseContent(parsed);
    if (extracted.content) content += extracted.content;
    if (extracted.usage) usage = extracted.usage;
  }

  if (!sawDataLine) return null;
  return { content, usage };
}

function parseProviderResponse(raw: string): { content: string; usage: Record<string, unknown> | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { content: '', usage: null };

  try {
    const parsed = JSON.parse(trimmed);
    const providerError = extractErrorMessage(parsed);
    if (providerError) throw new Error(providerError);
    return extractResponseContent(parsed);
  } catch (error) {
    const sseParsed = parseSsePayload(trimmed);
    if (sseParsed) return sseParsed;
    if (error instanceof Error) throw error;
    throw new Error('Provider response is not valid JSON.');
  }
}

async function fetchWithRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status < 500) return res;
    last = res;
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(8000, 500 * 2 ** i) + Math.random() * 300;
    await new Promise((r) => setTimeout(r, wait));
  }
  return last as Response;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatPayload;
    const baseURL = normalizeBaseURL(String(body.baseURL ?? '').trim());
    const apiKey = request.headers.get('x-provider-key')?.trim() || String(body.apiKey ?? '').trim();
    const model = String(body.model ?? '').trim();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!baseURL || !apiKey || !model || messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Missing baseURL/apiKey/model/messages' },
        { status: 400 }
      );
    }

    const cacheEnabled = Boolean((body.cache_control as { enable?: boolean } | undefined)?.enable);
    const messagesWithCache = applyProviderSpecificCaching(model, messages, cacheEnabled);
    const response = await fetchWithRetry(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(providerHeaders(model, cacheEnabled) ?? {}),
      },
      cache: 'no-store',
      body: JSON.stringify({
        model,
        messages: messagesWithCache,
        temperature: body.temperature ?? 0.2,
        max_tokens: body.max_tokens ?? 4000,
        response_format: body.response_format,
        stream: false,
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      let details = '';
      try {
        const parsed = JSON.parse(raw);
        details = extractErrorMessage(parsed) || raw;
      } catch {
        details = raw;
      }
      return NextResponse.json(
        {
          ok: false,
          error: `Provider HTTP ${response.status} ${response.statusText}: ${details.slice(0, 400)}`,
        },
        { status: 500 }
      );
    }

    const parsed = parseProviderResponse(raw);

    if (!parsed.content.trim()) {
      return NextResponse.json(
        { ok: false, error: 'EMPTY_CONTENT', finishReason: 'length', usage: parsed.usage },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      content: parsed.content,
      usage: parsed.usage,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown server error',
      },
      { status: 500 }
    );
  }
}

export const __chatInternal = {
  applyProviderSpecificCaching,
  providerHeaders,
  parseProviderResponse,
};
