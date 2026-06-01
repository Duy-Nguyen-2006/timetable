export type ProviderType = 'openrouter' | 'openai-responses' | 'generic-chat-completion-api';

const OPENAI_RESPONSES_MODEL_PATTERN = /^(gpt-5|gpt-4o|o\d|o-series|codex)/u;
const OPENAI_DIRECT_HOSTS = ['api.openai.com', 'openai.azure.com'];

function isOpenAIDirectBase(baseURL: string): boolean {
  const normalized = baseURL.toLowerCase();
  return OPENAI_DIRECT_HOSTS.some((host) => normalized.includes(host));
}

function isOpenAIResponsesModel(model: string): boolean {
  return OPENAI_RESPONSES_MODEL_PATTERN.test(model.toLowerCase());
}

export function resolveProvider(
  provider: ProviderType | undefined,
  baseURL: string,
  model: string
): ProviderType {
  // Auto-heal config cũ: nếu user explicit chọn generic-chat-completion-api
  // nhưng đang gọi OpenAI trực tiếp với model thuộc Responses API
  // (gpt-5/gpt-4o/o-series/codex), ép sang openai-responses để tránh
  // gọi /chat/completions với model không hỗ trợ.
  if (
    provider === 'generic-chat-completion-api' &&
    isOpenAIDirectBase(baseURL) &&
    isOpenAIResponsesModel(model)
  ) {
    return 'openai-responses';
  }

  if (provider === 'openai-responses' || provider === 'openrouter' || provider === 'generic-chat-completion-api') {
    return provider;
  }
  const normalizedBase = baseURL.toLowerCase();
  if (normalizedBase.includes('openrouter.ai')) return 'openrouter';
  if (isOpenAIResponsesModel(model)) return 'openai-responses';
  return 'generic-chat-completion-api';
}

export function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/u, '');
}
