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
  solverWorkers?: number;
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

function runExecutor(code: string, input: unknown, timeoutMs: number, solverWorkers?: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const repoRoot = process.cwd();
    const jobDir = path.join(
      os.tmpdir(),
      `tack-exec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    );
    const executorPath = path.join(repoRoot, 'python', 'code_executor.py');
    fs.mkdirSync(jobDir, { recursive: true });
    // Stringify không pretty-print để tiết kiệm băng thông disk I/O.
    fs.writeFileSync(path.join(jobDir, 'input.json'), JSON.stringify(input ?? {}), 'utf8');
    let cleanedUp = false;
    const cleanupJobDir = () => {
      if (cleanedUp) return; // fix bug #25 — idempotent cleanup
      cleanedUp = true;
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    };

    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    const workerCount = Math.min(8, Math.max(1, Math.floor(Number(solverWorkers ?? os.cpus().length - 1))));
    const child = spawn('python3', [executorPath, String(timeoutSeconds)], {
      cwd: jobDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONHASHSEED: '0',
        EXECUTOR_TIMEOUT_SECONDS: String(timeoutSeconds),
        SOLVER_MAX_SECONDS: String(Math.max(5, timeoutSeconds - 5)),
        SOLVER_WORKERS: String(workerCount),
      },
      detached: true, // để có process group riêng để kết thúc cả cây con (fix bug #7)
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const killTree = () => {
      // Tìm cách kill cả process group (bỏ qua nếu không hỗ trợ, ví dụ Windows).
      try {
        if (typeof child.pid === 'number') {
          process.kill(-child.pid, 'SIGKILL');
          return;
        }
      } catch {
        /* ignore */
      }
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
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
        // Trả best-feasible nếu solver kịp ghi result.json trước khi bị kill.
        const resultPath = path.join(jobDir, 'result.json');
        let partialResult: unknown;
        try {
          if (fs.existsSync(resultPath)) {
            partialResult = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
          }
        } catch { /* ignore */ }
        cleanupJobDir();
        if (
          partialResult &&
          typeof partialResult === 'object' &&
          (partialResult as any).status &&
          ['optimal', 'feasible'].includes(String((partialResult as any).status).toLowerCase()) &&
          Array.isArray((partialResult as any).schedule) &&
          (partialResult as any).schedule.length > 0
        ) {
          const artifactDir = path.join(process.cwd(), '.ai_results');
          fs.mkdirSync(artifactDir, { recursive: true });
          const artifactPath = path.join(artifactDir, `result_${Date.now()}.json`);
          fs.writeFileSync(artifactPath, JSON.stringify(partialResult), 'utf8');
          const partialStatus = String((partialResult as any).status).toLowerCase();
          resolve({
            phase: 'run',
            ok: true,
            status: partialStatus === 'optimal' ? 'optimal' : 'timeout_with_solution',
            durationMs: timeoutMs,
            resultPath: artifactPath,
            resultData: partialResult,
            errorDigest: '',
            stdout: '',
            stderr: '',
          });
          return;
        }
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
      // fix bug #28 — dùng line-boundary slice an toàn hơn cho stderr.

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

        // Validate resultPath: phải nằm trong os.tmpdir() hoặc jobDir,
        // tránh path traversal khi Python emit đường dẫn độc hại. (fix bug #26)
        const resolvedResultPath =
          resultPath && path.isAbsolute(resultPath) ? path.resolve(resultPath) : '';
        const tmpRoot = path.resolve(os.tmpdir());
        const cwdRoot = path.resolve(process.cwd());
        const safeResultPath =
          resolvedResultPath &&
          (resolvedResultPath.startsWith(tmpRoot + path.sep) ||
            resolvedResultPath.startsWith(cwdRoot + path.sep))
            ? resolvedResultPath
            : '';
        if (resolvedResultPath && !safeResultPath) {
          // Reject mặc không load file ngoài whitelist.
          resultData = undefined;
        } else if (safeResultPath && fs.existsSync(safeResultPath)) {
          try {
            resultData = JSON.parse(fs.readFileSync(safeResultPath, 'utf8'));
          } catch {
            resultData = undefined;
          }
        }

        resolve({
          ...parsed,
          ...(resultData ? { resultData } : {}),
          // fix bug #27 — KHÔNG gửi stdout/stderr gốc (đã có errorDigest).
          // Chỉ giữ stdout/stderr của Python wrapper dưới dạng truncated
          // để debug khi ok=false.
          stdout:
            typeof parsed.stdout === 'string'
              ? truncateOutput(parsed.stdout, 40)
              : '',
          stderr:
            typeof parsed.stderr === 'string'
              ? truncateOutput(parsed.stderr, 40)
              : '',
          errorDigest:
            typeof parsed.errorDigest === 'string'
              ? digestError(parsed.errorDigest)
              : digestError(stderr || stdout),
        });
      } catch {
        reject(
          new Error(
            `Executor output is not valid JSON. Last line: ${lastLine.slice(0, 300)}. Stderr: ${stderr.slice(0, 300)}`
          )
        );
      } finally {
        cleanupJobDir(); // idempotent
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

    const result = await runExecutor(code, body.input, timeoutMs, body.solverWorkers);
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