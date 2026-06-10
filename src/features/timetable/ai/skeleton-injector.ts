/**
 * skeleton-injector.ts
 *
 * `injectConstraintCode` không chỉ dành cho AI code injection. Nó còn
 * được dùng để inject empty custom constraint block trong deterministic
 * mode (`injectConstraintCode(skeleton, '')`), trong đó marker được fill
 * bằng `pass` và skeleton giữ nguyên built-in constraint encoders.
 */

const MARKER_LINE = /^[ \t]*#\s*<<<\s*AI_FILL_HERE\s*>>>\s*$/m;

export async function loadSolverSkeleton(): Promise<string> {
  const publicResponse = await fetch('/templates/solver_skeleton.py').catch(() => null);
  if (publicResponse?.ok) {
    return publicResponse.text();
  }

  const routeResponse = await fetch('/api/ai/solver-skeleton').catch(() => null);
  if (!routeResponse?.ok) {
    throw new Error('Unable to load solver skeleton template.');
  }
  return routeResponse.text();
}

export function normalizeConstraintCodeBody(constraintCode: string): string {
  const trimmed = constraintCode.trim();
  return trimmed ? trimmed : 'pass';
}


export function injectConstraintCode(
  skeleton: string,
  constraintCode: string
): { solverCode: string; injected: boolean } {
  const markerMatch = skeleton.match(MARKER_LINE);
  if (!markerMatch) return { solverCode: skeleton, injected: false };

  const baseIndent = markerMatch[0].match(/^[ \t]*/)?.[0] ?? '';
  const sourceLines = normalizeConstraintCodeBody(constraintCode).split('\n');
  const indented = sourceLines
    .map((line) => {
      if (!line.trim().length) return '';
      return `${baseIndent}${line.replace(/\s+$/, '')}`;
    })
    .join('\n');

  // Use function form of replace to avoid '$1', '$', '$$' etc being treated
  // as special replacement patterns in the generated code (fix bug #3).
  return {
    solverCode: skeleton.replace(MARKER_LINE, () => indented),
    injected: true,
  };
}

type PythonCheckResult = {
  ok?: boolean;
  error?: string;
  errorDigest?: string;
  stderr?: string;
  stdout?: string;
}

type PythonCheckBridge = {
  syntaxCheck?: (code: string) => Promise<PythonCheckResult>
  astCheck?: (code: string) => Promise<PythonCheckResult>
}

function pythonCheckError(result: PythonCheckResult): string | undefined {
  return result.error || result.errorDigest || result.stderr || result.stdout;
}

function pythonCheckBridge(): PythonCheckBridge | null {
  if (typeof window === 'undefined') return null
  return (window.electron?.python ?? null) as PythonCheckBridge | null
}

export async function syntaxCheckPython(code: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const bridge = pythonCheckBridge()
    if (bridge?.syntaxCheck) {
      const result = await bridge.syntaxCheck(code)
      return { ok: Boolean(result.ok), error: pythonCheckError(result) }
    }

    const response = await fetch('/api/ai/python-syntax-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      result?: { ok?: boolean; error?: string };
      error?: string;
    };

    if (!response.ok || !payload.ok || !payload.result) {
      return { ok: false, error: payload.error || 'Python syntax check API failed.' };
    }

    return {
      ok: Boolean(payload.result.ok),
      error: payload.result.error,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to run Python syntax check.',
    };
  }
}

export async function astCheckPython(code: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const bridge = pythonCheckBridge()
    if (bridge?.astCheck) {
      const result = await bridge.astCheck(code)
      return { ok: Boolean(result.ok), error: pythonCheckError(result) }
    }

    const response = await fetch('/api/ai/python-ast-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      result?: { ok?: boolean; error?: string };
      error?: string;
    };

    if (!response.ok || !payload.ok || !payload.result) {
      return { ok: false, error: payload.error || 'AST check API failed.' };
    }

    return {
      ok: Boolean(payload.result.ok),
      error: payload.result.error,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'AST check failed.',
    };
  }
}
