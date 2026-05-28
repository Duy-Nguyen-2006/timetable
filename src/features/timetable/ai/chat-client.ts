import type { ChatUsage } from './types';

export interface ChatPayload {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: Record<string, unknown>;
  cache_control?: Record<string, unknown>;
}

export async function invokeChat(
  payload: ChatPayload
): Promise<{ content?: string; usage?: ChatUsage }> {
  const { apiKey, ...rest } = payload;
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Provider-Key': apiKey,
    },
    body: JSON.stringify(rest),
  });

  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    content?: string;
    error?: string;
    usage?: ChatUsage;
  };

  if (!response.ok || !body?.ok) {
    throw new Error(body?.error || `Chat API failed with status ${response.status}`);
  }

  return {
    content: String(body.content ?? ''),
    usage: body.usage,
  };
}
