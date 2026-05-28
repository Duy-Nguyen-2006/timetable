import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { NextResponse } from 'next/server';

type SyntaxCheckPayload = {
  code?: string;
};

function digestError(raw: string, maxLen = 800): string {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const focused = lines.slice(-12).join('\n');
  if (focused.length <= maxLen) return focused;
  return `${focused.slice(0, maxLen - 3)}...`;
}

function checkPythonSyntax(code: string): { ok: boolean; error?: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-python-syntax-'));
  const filePath = path.join(tempDir, 'solver_syntax_check.py');

  try {
    fs.writeFileSync(filePath, code, 'utf8');
    const result = spawnSync('python3', ['-m', 'py_compile', filePath], {
      cwd: tempDir,
      encoding: 'utf8',
    });

    if (result.status === 0) return { ok: true };

    return {
      ok: false,
      error: digestError(result.stderr || result.stdout || 'Python syntax check failed.'),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyntaxCheckPayload;
    const code = String(body.code ?? '');

    if (!code.trim()) {
      return NextResponse.json({ ok: false, error: 'Missing python code.' }, { status: 400 });
    }

    const result = checkPythonSyntax(code);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown syntax check error',
      },
      { status: 500 }
    );
  }
}
