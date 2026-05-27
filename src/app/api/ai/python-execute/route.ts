import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type ExecutePayload = {
  code?: string;
  input?: unknown;
  timeoutMs?: number;
};

function runExecutor(code: string, input: unknown, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const repoRoot = process.cwd();
    const executorPath = path.join(repoRoot, 'python', 'code_executor.py');

    const child = spawn('python3', [executorPath], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, Math.max(1_000, timeoutMs));

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error('Python execution timed out.'));
        return;
      }

      const lines = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const lastLine = lines[lines.length - 1];

      if (!lastLine) {
        reject(new Error(`Executor returned empty output. Stderr: ${stderr.slice(0, 400)}`));
        return;
      }

      try {
        resolve(JSON.parse(lastLine));
      } catch {
        reject(
          new Error(
            `Executor output is not valid JSON. Last line: ${lastLine.slice(0, 300)}. Stderr: ${stderr.slice(0, 300)}`
          )
        );
      }
    });

    child.stdin.write(code);
    child.stdin.end();

    // code_executor.py expects ./input.json in cwd
    fs.writeFileSync(path.join(repoRoot, 'input.json'), JSON.stringify(input ?? {}, null, 2), 'utf8');
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExecutePayload;
    const code = String(body.code ?? '');
    const timeoutMs = Number(body.timeoutMs ?? 180_000);

    if (!code.trim()) {
      return NextResponse.json({ ok: false, error: 'Missing python code.' }, { status: 400 });
    }

    const result = await runExecutor(code, body.input, timeoutMs);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown execution error',
      },
      { status: 500 }
    );
  }
}
