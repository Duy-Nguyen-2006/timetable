export type ProviderType = 'openrouter' | 'openai-responses' | 'generic-chat-completion-api';

export function resolveProvider(
  provider: ProviderType | undefined,
  baseURL: string,
  model: string
): ProviderType {
  if (provider === 'openai-responses' || provider === 'openrouter' || provider === 'generic-chat-completion-api') {
    return provider;
  }
  const normalizedModel = model.toLowerCase();
  const normalizedBase = baseURL.toLowerCase();
  if (normalizedBase.includes('openrouter.ai')) return 'openrouter';
  if (/^(gpt-5|gpt-4o|o\d|o-series|codex)/u.test(normalizedModel)) return 'openai-responses';
  return 'generic-chat-completion-api';
}

export function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/u, '');
}
