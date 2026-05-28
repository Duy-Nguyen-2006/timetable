import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { NextResponse } from 'next/server';

type CheckPayload = {
  code?: string;
};

const CHECKER_SCRIPT = `
import ast, json, sys, textwrap
FORBIDDEN_NAMES = {"open", "exec", "eval", "__import__", "compile", "input", "breakpoint", "globals", "locals", "vars", "print"}
FORBIDDEN_ATTRS = {"__import__", "__builtins__", "__class__", "__bases__", "__subclasses__", "__mro__"}

try:
    source = textwrap.dedent(sys.stdin.read())
    tree = ast.parse(source)
except SyntaxError as exc:
    print(json.dumps({"ok": False, "error": f"SyntaxError: {exc}"}))
    sys.exit(0)

errors = []
for node in ast.walk(tree):
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        errors.append(f"Forbidden import at line {node.lineno}")
    elif isinstance(node, ast.Call):
        fn = node.func
        name = getattr(fn, "id", None) or getattr(fn, "attr", None)
        if name in FORBIDDEN_NAMES:
            errors.append(f"Forbidden call '{name}' at line {node.lineno}")
    elif isinstance(node, ast.Attribute):
        if node.attr in FORBIDDEN_ATTRS:
            errors.append(f"Forbidden attribute '{node.attr}' at line {node.lineno}")

print(json.dumps({"ok": len(errors) == 0, "error": "; ".join(errors) if errors else None}))
`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckPayload;
    const code = String(body.code ?? '');
    if (!code.trim()) {
      return NextResponse.json({ ok: false, error: 'Missing python code.' }, { status: 400 });
    }
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-ast-'));
    try {
      const result = spawnSync('python3', ['-c', CHECKER_SCRIPT], {
        input: code,
        encoding: 'utf8',
        cwd: tempDir,
      });
      if (result.status !== 0) {
        return NextResponse.json({
          ok: false,
          error: `AST check failed: ${result.stderr || result.stdout}`,
        }, { status: 500 });
      }
      const parsed = JSON.parse(result.stdout.trim() || '{"ok":true}') as { ok: boolean; error?: string };
      return NextResponse.json({ ok: true, result: parsed });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown AST check error',
    }, { status: 500 });
  }
}
