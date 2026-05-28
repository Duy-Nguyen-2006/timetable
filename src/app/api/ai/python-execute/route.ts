import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type ExecutePayload = {
  code?: string;
  input?: unknown;
  timeoutMs?: number;
};

function digestError(raw: string, maxLen = 800): string {
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const focused = lines.slice(-12).join('\n');
  if (focused.length <= maxLen) return focused;
  return `${focused.slice(0, maxLen - 3)}...`;
}

function truncateOutput(raw: string, maxLines = 100): string {
  const lines = raw.split('\n');
  if (lines.length <= maxLines) return raw;
  return `${lines.slice(0, maxLines).join('\n')}\n...[truncated ${lines.length - maxLines} lines]`;
}

function runExecutor(code: string, input: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const repoRoot = process.cwd();
    const jobDir = path.join(
      os.tmpdir(),
      `tack-exec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    );
    const executorPath = path.join(repoRoot, 'python', 'code_executor.py');
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, 'input.json'), JSON.stringify(input ?? {}, null, 2), 'utf8');
    const cleanupJobDir = () => {
      fs.rmSync(jobDir, { recursive: true, force: true });
    };

    const child = spawn('python3', [executorPath], {
      cwd: jobDir,
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
      cleanupJobDir();
      reject(err);
    });

    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut) {
        cleanupJobDir();
        reject(new Error('Python execution timed out.'));
        return;
      }

      const lines = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const lastLine = lines[lines.length - 1];

      if (!lastLine) {
        cleanupJobDir();
        reject(new Error(`Executor returned empty output. Stderr: ${stderr.slice(0, 400)}`));
        return;
      }

      try {
        const parsed = JSON.parse(lastLine) as Record<string, unknown>;
        const resultPath =
          typeof parsed.resultPath === 'string' && parsed.resultPath ? parsed.resultPath : '';
        let resultData: unknown;
        if (resultPath && fs.existsSync(resultPath)) {
          try {
            resultData = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
          } catch {
            resultData = undefined;
          }
        }

        resolve({
          ...parsed,
          ...(resultData ? { resultData } : {}),
          stdout: typeof parsed.stdout === 'string' ? truncateOutput(parsed.stdout) : '',
          stderr: typeof parsed.stderr === 'string' ? truncateOutput(parsed.stderr) : '',
          errorDigest:
            typeof parsed.errorDigest === 'string'
              ? digestError(parsed.errorDigest)
              : digestError(stderr || stdout),
        });
      } catch {
        cleanupJobDir();
        reject(
          new Error(
            `Executor output is not valid JSON. Last line: ${lastLine.slice(0, 300)}. Stderr: ${stderr.slice(0, 300)}`
          )
        );
      } finally {
        cleanupJobDir();
      }
    });

    child.stdin.write(code);
    child.stdin.end();
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExecutePayload;
    const code = String(body.code ?? '');
    const timeoutMs = Number(body.timeoutMs ?? 360_000);

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
