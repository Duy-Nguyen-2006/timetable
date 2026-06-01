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

export function injectConstraintCode(
  skeleton: string,
  constraintCode: string
): { solverCode: string; injected: boolean } {
  const markerMatch = skeleton.match(MARKER_LINE);
  if (!markerMatch) return { solverCode: skeleton, injected: false };

  const baseIndent = markerMatch[0].match(/^[ \t]*/)?.[0] ?? '';
  const normalized = constraintCode.replace(/\r\n/g, '\n').replace(/\t/g, '    ');
  // Detect minimum non-empty leading indent of source to strip it uniformly,
  // preserving ALL relative nested indentation (fix bug #4).
  const sourceLines = normalized.split('\n');
  let minLeading = Infinity;
  for (const line of sourceLines) {
    if (!line.trim().length) continue;
    const leading = (line.match(/^[ \t]*/)?.[0] ?? '').length;
    if (leading < minLeading) minLeading = leading;
  }
  if (!Number.isFinite(minLeading)) minLeading = 0;
  const indented = sourceLines
    .map((line) => {
      if (!line.trim().length) return '';
      const stripped = line.slice(minLeading);
      return `${baseIndent}${stripped.replace(/\s+$/, '')}`;
    })
    .join('\n');

  // Use function form of replace to avoid '$1', '$', '$$' etc being treated
  // as special replacement patterns in the generated code (fix bug #3).
  return {
    solverCode: skeleton.replace(MARKER_LINE, () => indented),
    injected: true,
  };
}

type PythonCheckBridge = {
  syntaxCheck?: (code: string) => Promise<{ ok?: boolean; error?: string }>
  astCheck?: (code: string) => Promise<{ ok?: boolean; error?: string }>
}

function pythonCheckBridge(): PythonCheckBridge | null {
  if (typeof window === 'undefined') return null
  return ((window as any).electron?.python ?? null) as PythonCheckBridge | null
}

export async function syntaxCheckPython(code: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const bridge = pythonCheckBridge()
    if (bridge?.syntaxCheck) {
      const result = await bridge.syntaxCheck(code)
      return { ok: Boolean(result.ok), error: result.error }
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
      return { ok: Boolean(result.ok), error: result.error }
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
