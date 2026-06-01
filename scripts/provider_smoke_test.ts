async function main() {
  const baseURL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.LOWPRIZO_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v4-flash';

  if (process.env.SKIP_PROVIDER_SMOKE === '1') {
    console.log('Provider smoke skipped: SKIP_PROVIDER_SMOKE=1');
    process.exit(0);
  }

  if (!apiKey) {
    console.log('Provider smoke skipped: no OPENROUTER_API_KEY/LOWPRIZO_API_KEY. Set SKIP_PROVIDER_SMOKE=1 to silence.');
    process.exit(0);
  }

  const response = await fetch(`${baseURL.replace(/\/+$/u, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_tokens: 8,
      temperature: 0,
    }),
  });

  const body = await response.text();
  console.log(JSON.stringify({ status: response.status, ok: response.ok, body: body.slice(0, 500) }, null, 2));
  process.exit(response.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
