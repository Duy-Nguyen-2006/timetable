import assert from 'node:assert/strict';

const BASE_URL = process.env.TACK_BASE_URL || 'http://localhost:3000';
const REQUESTS = Number(process.env.TACK_CONCURRENCY || 5);

const pythonCode = `
import json
from pathlib import Path

input_data = json.loads(Path("input.json").read_text(encoding="utf-8"))
marker = str(input_data.get("marker", "missing"))
result = {
    "status": "OPTIMAL",
    "schedule": [
        {
            "class": "6A",
            "day": "mon",
            "period": 1,
            "subject": "Toan",
            "teacher": "Son",
            "assignmentId": marker,
        }
    ],
}
Path("result.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
print("SOLUTION_FOUND")
`;

async function runOne(index: number) {
  const response = await fetch(`${BASE_URL}/api/ai/python-execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: pythonCode,
      input: { marker: `req-${index}` },
      timeoutMs: 30_000,
    }),
  });
  const body = (await response.json()) as {
    ok: boolean;
    result?: { resultData?: { schedule?: Array<{ assignmentId?: string }> } };
    error?: string;
  };
  if (!response.ok || !body.ok || !body.result?.resultData?.schedule?.length) {
    throw new Error(body.error || `Request ${index} failed`);
  }
  return body.result.resultData.schedule[0].assignmentId;
}

async function main() {
  const markers = await Promise.all(Array.from({ length: REQUESTS }, (_, i) => runOne(i + 1)));
  assert.equal(markers.length, REQUESTS);
  assert.equal(new Set(markers).size, REQUESTS, `Expected ${REQUESTS} unique markers, got ${markers}`);
  console.log(JSON.stringify({ ok: true, markers }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
