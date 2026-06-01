import { NextResponse } from 'next/server';
import { type ProviderType, resolveProvider as resolveProviderShared, normalizeBaseURL } from '@/lib/provider';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatPayload = {
  provider?: ProviderType;
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

function extractResponseOutputContent(payload: unknown): string {
  const record = asRecord(payload);
  if (!record) return '';

  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text;
  }

  const output = Array.isArray(record.output) ? record.output : [];
  let content = '';
  for (const item of output) {
    const itemRecord = asRecord(item);
    const parts = Array.isArray(itemRecord?.content) ? itemRecord.content : [];
    for (const part of parts) {
      const partRecord = asRecord(part);
      if (typeof partRecord?.text === 'string') content += partRecord.text;
      if (typeof partRecord?.output_text === 'string') content += partRecord.output_text;
    }
  }
  return content;
}

function extractResponseContent(payload: unknown): { content: string; usage: Record<string, unknown> | null } {
  const record = asRecord(payload);
  if (!record) return { content: '', usage: null };

  const responseOutput = extractResponseOutputContent(record);
  if (responseOutput) {
    return { content: responseOutput, usage: asRecord(record.usage) };
  }

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

function stripCacheControlFromMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) return messages;
  return messages.map((message) => {
    if (!message || typeof message !== 'object') return message;
    const { cache_control, ...rest } = message as Record<string, unknown>;
    return rest;
  });
}

function buildCompatibilityRetryBody(
  provider: ProviderType,
  requestBody: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...requestBody };

  if (provider === 'openai-responses') {
    delete next.text;
    const rawMax = Number(next.max_output_tokens ?? 4000);
    next.max_output_tokens = Math.min(
      Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 4000,
      12000
    );
    return next;
  }

  delete next.response_format;
  next.messages = stripCacheControlFromMessages(next.messages);
  const rawMax = Number(next.max_tokens ?? 4000);
  next.max_tokens = Math.min(
    Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 4000,
    12000
  );
  return next;
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

function buildChatRequest(
  provider: ProviderType,
  baseURL: string,
  model: string,
  messages: ChatMessage[],
  body: ChatPayload,
  cacheEnabled: boolean
): { url: string; requestBody: Record<string, unknown>; headers: Record<string, string> } {
  if (provider === 'openai-responses') {
    const input = messages.map((message) => ({ role: message.role, content: message.content }));
    return {
      url: `${baseURL}/responses`,
      headers: {},
      requestBody: {
        model,
        input,
        temperature: body.temperature ?? 0.2,
        max_output_tokens: body.max_tokens ?? 4000,
        text: body.response_format ? { format: body.response_format } : undefined,
        store: false,
      },
    };
  }

  return {
    url: `${baseURL}/chat/completions`,
    headers: providerHeaders(model, cacheEnabled) ?? {},
    requestBody: {
      model,
      messages: applyProviderSpecificCaching(model, messages, cacheEnabled),
      temperature: body.temperature ?? 0.2,
      max_tokens: body.max_tokens ?? 4000,
      response_format: body.response_format,
      stream: false,
    },
  };
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

    const apiKeyReceived = Boolean(apiKey);
    if (!baseURL || !apiKeyReceived || !model || messages.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Internal chat config missing: baseURL/model/messages/apiKeyReceived=${apiKeyReceived}`,
        },
        { status: 400 }
      );
    }

    const cacheEnabled = Boolean((body.cache_control as { enable?: boolean } | undefined)?.enable);
    const provider = resolveProviderShared(body.provider, baseURL, model);
    const chatRequest = buildChatRequest(provider, baseURL, model, messages, body, cacheEnabled);

    // Diagnostics (safe, no apiKey)
    const baseHost = (() => { try { return new URL(baseURL).host; } catch { return 'unknown'; } })();
    const usedResponseFormat = Boolean(chatRequest.requestBody.response_format || (chatRequest.requestBody as any).text?.format);
    const maxTokensUsed = Number(
      (chatRequest.requestBody as any).max_tokens ?? (chatRequest.requestBody as any).max_output_tokens ?? 4000
    );

    let response = await fetchWithRetry(chatRequest.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...chatRequest.headers,
      },
      cache: 'no-store',
      body: JSON.stringify(chatRequest.requestBody),
    });

    let raw = await response.text();
    let usedRetry = false;

    if (!response.ok && (response.status === 400 || response.status === 422)) {
      // Compatibility retry: strip json_schema / text.format, clamp tokens, drop cache_control + anthropic header
      const retryBody = buildCompatibilityRetryBody(provider, chatRequest.requestBody);
      const retryResponse = await fetchWithRetry(chatRequest.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // deliberately omit extra headers like anthropic-beta on retry
        },
        cache: 'no-store',
        body: JSON.stringify(retryBody),
      });
      const retryRaw = await retryResponse.text();
      if (retryResponse.ok) {
        response = retryResponse;
        raw = retryRaw;
        usedRetry = true;
      } else {
        // Both failed; fall through with original response/raw for error details below
      }
    }

    if (!response.ok) {
      let details = '';
      try {
        const parsed = JSON.parse(raw);
        details = extractErrorMessage(parsed) || raw;
      } catch {
        details = raw;
      }

      const status = response.status;
      let errorMsg: string;
      if (status === 401 || status === 403) {
        errorMsg = `Provider auth rejected (HTTP ${status}). Check API key for ${provider} at ${baseHost}.`;
      } else if (status === 400 || status === 422) {
        errorMsg = `Provider rejected request body (HTTP ${status}, not auth/key). provider=${provider} host=${baseHost} model=${model} response_format=${usedResponseFormat} max_tokens=${maxTokensUsed}${usedRetry ? ' (retry also failed)' : ''}. ${details.slice(0, 300)}`;
      } else {
        errorMsg = `Provider HTTP ${status} ${response.statusText}: ${details.slice(0, 400)}`;
      }

      return NextResponse.json(
        {
          ok: false,
          error: errorMsg,
          diagnostics: {
            provider,
            host: baseHost,
            model,
            status,
            usedResponseFormat,
            maxTokensUsed,
            retried: usedRetry,
          },
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

    const successPayload: any = {
      ok: true,
      content: parsed.content,
      usage: parsed.usage,
    };
    if (usedRetry) {
      successPayload.diagnostics = { retriedForCompatibility: true, provider, host: baseHost, model };
    }
    return NextResponse.json(successPayload);
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
  resolveProvider: resolveProviderShared,
  buildChatRequest,
  parseProviderResponse,
  stripCacheControlFromMessages,
  buildCompatibilityRetryBody,
};
