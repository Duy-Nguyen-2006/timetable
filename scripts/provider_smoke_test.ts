type ChatResponse = {
  ok?: boolean;
  usage?: {
    total_tokens?: number;
  } | null;
  error?: string;
};

const cases = [
  { name: 'anthropic', model: 'anthropic/claude-3-5-haiku', cache: true },
  { name: 'openai', model: 'openai/gpt-4o-mini', cache: false },
  { name: 'deepseek', model: 'deepseek/deepseek-chat', cache: false },
];

const apiKey =
  process.env.AI_PROVIDER_API_KEY ||
  process.env.OPENROUTER_API_KEY ||
  process.env.LOWPRIZO_API_KEY;
const baseURL = process.env.AI_PROVIDER_BASE_URL || 'https://openrouter.ai/api/v1';
const endpoint = process.env.PROVIDER_SMOKE_URL || 'http://localhost:3000/api/ai/chat';

if (process.env.SKIP_PROVIDER_SMOKE === '1') {
  console.log('Provider smoke skipped: SKIP_PROVIDER_SMOKE=1');
  process.exit(0);
}

if (!apiKey) {
  console.log('Provider smoke skipped: missing AI_PROVIDER_API_KEY/OPENROUTER_API_KEY/LOWPRIZO_API_KEY.');
  process.exit(0);
}

async function main(): Promise<void> {
  for (const testCase of cases) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseURL,
        apiKey,
        model: testCase.model,
        messages: [
          { role: 'system', content: 'ping' },
          { role: 'user', content: 'pong' },
        ],
        max_tokens: 8,
        cache_control: { enable: testCase.cache },
      }),
    });
    const json = (await response.json()) as ChatResponse;

    console.log(testCase.name, response.status, json.usage);

    if (response.status >= 400) {
      throw new Error(`${testCase.name} HTTP ${response.status}: ${json.error ?? 'unknown error'}`);
    }
    if (!json.usage?.total_tokens) {
      throw new Error(`${testCase.name} missing usage.total_tokens`);
    }
  }

  console.log('All providers OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
