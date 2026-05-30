import type { ChatUsage } from './types';

export interface ChatPayload {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  timeoutMs?: number;
  response_format?: Record<string, unknown>;
  cache_control?: Record<string, unknown>;
}

export async function invokeChat(
  payload: ChatPayload
): Promise<{ content?: string; usage?: ChatUsage }> {
  const { apiKey, ...rest } = payload;
  const requestedTimeoutMs = Number(payload.timeoutMs ?? 45_000);
  const timeoutMs = Math.max(
    1_000,
    Math.min(Number.isFinite(requestedTimeoutMs) ? requestedTimeoutMs : 45_000, 180_000)
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Provider-Key': apiKey,
      },
      body: JSON.stringify(rest),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Chat API timed out after ${Math.ceil(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

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
