// Direct LLM smoke: chứng minh API key hoạt động với real model
import { config } from 'dotenv';
config({ path: '.env.local' });

const apiKey = process.env.OPENROUTER_API_KEY;
const baseURL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
const model = process.env.MODEL_NAME ?? 'deepseek/deepseek-v4-flash';

if (!apiKey) {
  console.error('OPENROUTER_API_KEY not set');
  process.exit(1);
}

// Test 1: simple "PONG" reply
async function test1() {
  console.log(`\n=== Test 1: simple ping ===`);
  const t0 = Date.now();
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with the single word: PONG' }],
      max_tokens: 10,
      temperature: 0,
    }),
  });
  const elapsed = Date.now() - t0;
  const json: any = await res.json();
  console.log(`status: ${res.status} (${elapsed}ms)`);
  console.log(`content: ${json.choices?.[0]?.message?.content}`);
  console.log(`model: ${json.model}`);
  console.log(`usage: ${JSON.stringify(json.usage)}`);
  return res.status === 200;
}

// Test 2: realistic translator-like prompt (Vietnamese constraint)
async function test2() {
  console.log(`\n=== Test 2: Vietnamese constraint parsing ===`);
  const systemPrompt = `Bạn là Constraint Translator. Trả về JSON {constraintSpecs: [{id, original, severity, kind, params}]}.`;
  const userPrompt = `Dịch câu sau: "Nếu Sơn và Hương cùng dạy thứ 2 tiết 2 thì cặp Sơn-Hương không dạy cùng tiết nào các ngày còn lại". Trả về nhiều ConstraintSpec nếu cần.`;
  const t0 = Date.now();
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0,
    }),
  });
  const elapsed = Date.now() - t0;
  const text = await res.text();
  console.log(`status: ${res.status} (${elapsed}ms)`);
  console.log(`raw (first 800 chars): ${text.slice(0, 800)}`);
  return res.status === 200;
}

(async () => {
  const t1 = await test1();
  const t2 = await test2();
  console.log(`\n=== Summary ===`);
  console.log(`Test 1 (PONG): ${t1 ? 'PASS' : 'FAIL'}`);
  console.log(`Test 2 (Vietnamese parse): ${t2 ? 'PASS' : 'FAIL'}`);
  process.exit(t1 && t2 ? 0 : 1);
})().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
