import OpenAI from 'openai';
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatPayload;
    const baseURL = String(body.baseURL ?? '').trim();
    const apiKey = String(body.apiKey ?? '').trim();
    const model = String(body.model ?? '').trim();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!baseURL || !apiKey || !model || messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Missing baseURL/apiKey/model/messages' },
        { status: 400 }
      );
    }

    const cacheEnabled = Boolean((body.cache_control as { enable?: boolean } | undefined)?.enable);
    const client = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: providerHeaders(model, cacheEnabled),
    });

    const messagesWithCache = applyProviderSpecificCaching(model, messages, cacheEnabled);

    const completion = await client.chat.completions.create({
      model,
      messages: messagesWithCache as any,
      temperature: body.temperature ?? 0.2,
      max_tokens: body.max_tokens ?? 4000,
      response_format: body.response_format as any,
    });

    const content = normalizeContent(completion.choices[0]?.message?.content);

    return NextResponse.json({
      ok: true,
      content,
      usage: completion.usage ?? null,
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
};
