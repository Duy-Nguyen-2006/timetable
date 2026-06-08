import type { AIProviderType, ChatUsage } from './types';

export interface ChatPayload {
  provider?: AIProviderType;
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
    body: JSON.stringify({
      ...rest,
      apiKey, // internal server fallback; never forward this field except as Authorization bearer
    }),
  });

  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    content?: string;
    error?: string;
    usage?: ChatUsage;
  };

  if (!response.ok || !body?.ok) {
    const err = body?.error || `Chat API failed with status ${response.status}`;
    // Distinguish internal config, provider body rejection, auth, and empty response for UI/repair loops
    const errorToThrow = err.includes('EMPTY_RESPONSE') 
      ? 'AI không trả về nội dung. Vui lòng thử lại hoặc kiểm tra cấu hình.' 
      : err;
    throw new Error(errorToThrow);
  }

  return {
    content: String(body.content ?? ''),
    usage: body.usage,
  };
}
