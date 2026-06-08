const MARKER_LINE = /^[ \t]*#\s*<<<\s*AI_FILL_HERE\s*>>>\s*$/m;
const BUILD_CUSTOM_CONSTRAINTS = /^([ \t]*)def\s+build_custom_constraints\s*\([^)]*\)\s*:\s*(.*)$/;
const PYTHON_FENCE = /^```(?:[ \t]*(?:python|py))?[ \t]*\r?\n([\s\S]*?)\r?\n?```[ \t]*$/i;
const PYTHON_FENCE_BLOCK = /```(?:[ \t]*(?:python|py))?[ \t]*\r?\n([\s\S]*?)\r?\n?```/i;
const PYTHON_START_LINE = /^(?:(?:for|if|elif|else|while|try|except|finally|with|def|class|pass|raise|return|assert)\b|[A-Za-z_]\w*\s*=|[A-Za-z_]\w*\.)/;

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

function normalizeLineEndings(source: string): string {
  return source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '    ');
}

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}

function dedentPythonBlock(source: string): string {
  const lines = normalizeLineEndings(source).split('\n');
  let minLeading = Infinity;
  for (const line of lines) {
    if (!line.trim().length) continue;
    const leading = (line.match(/^[ \t]*/)?.[0] ?? '').length;
    if (leading < minLeading) minLeading = leading;
  }
  if (!Number.isFinite(minLeading)) minLeading = 0;
  return trimOuterBlankLines(lines)
    .map((line) => (line.trim().length ? line.slice(minLeading).replace(/\s+$/, '') : ''))
    .join('\n');
}

function stripMarkdownFence(source: string): string {
  const trimmed = source.trim();
  const fullFence = trimmed.match(PYTHON_FENCE);
  if (fullFence) return fullFence[1].trim();

  const fencedBlock = trimmed.match(PYTHON_FENCE_BLOCK);
  if (fencedBlock) return fencedBlock[1].trim();

  return trimmed;
}

function takeUntilTemplateReturn(lines: string[]): string[] {
  const end = lines.findIndex((line) => /^\s*return\s+\(?\s*soft_terms\b/.test(line));
  return end >= 0 ? lines.slice(0, end) : lines;
}

function trimExplanatoryProse(source: string): string {
  const lines = normalizeLineEndings(source).split('\n');
  const start = lines.findIndex((line) => {
    const trimmed = line.trim();
    return Boolean(trimmed) && (trimmed.startsWith('#') || PYTHON_START_LINE.test(trimmed));
  });
  if (start <= 0) return source;
  return lines.slice(start).join('\n');
}

function extractMarkedRegion(source: string): string | null {
  const lines = normalizeLineEndings(source).split('\n');
  const markerIndex = lines.findIndex((line) => MARKER_LINE.test(line));
  if (markerIndex < 0) return null;
  return dedentPythonBlock(takeUntilTemplateReturn(lines.slice(markerIndex + 1)).join('\n'));
}

function extractBuildCustomConstraintsBody(source: string): string {
  const lines = normalizeLineEndings(source).split('\n');
  const defIndex = lines.findIndex((line) => BUILD_CUSTOM_CONSTRAINTS.test(line));
  if (defIndex < 0) return source;

  const match = lines[defIndex].match(BUILD_CUSTOM_CONSTRAINTS);
  const baseIndent = match?.[1].length ?? 0;
  const inlineBody = match?.[2]?.trim();
  if (inlineBody && !inlineBody.startsWith('#')) return inlineBody;

  const bodyLines: string[] = [];
  for (const line of lines.slice(defIndex + 1)) {
    const leading = (line.match(/^[ \t]*/)?.[0] ?? '').length;
    if (line.trim() && leading <= baseIndent) break;
    bodyLines.push(line);
  }

  const body = dedentPythonBlock(takeUntilTemplateReturn(bodyLines).join('\n'));
  const bodySplit = body.split('\n');
  const customSpecsIndex = bodySplit.findIndex((line) => /^\s*custom_specs\s*=/.test(line));
  if (customSpecsIndex >= 0) {
    return dedentPythonBlock(bodySplit.slice(customSpecsIndex + 1).join('\n'));
  }
  return body;
}

function stripFullSkeletonBoilerplate(source: string): string {
  const marked = extractMarkedRegion(source);
  if (marked !== null) return marked;

  const lines = normalizeLineEndings(source).split('\n');
  const looksLikeFullSkeleton =
    lines.some((line) => /^\s*unsupported_soft_kinds\s*=\s*\[\]/.test(line)) &&
    lines.some((line) => /^\s*for\s+spec\s+in\s+constraints\s*:/.test(line));
  if (!looksLikeFullSkeleton) return source;

  const customSpecsIndex = lines.findIndex((line) => /^\s*custom_specs\s*=/.test(line));
  if (customSpecsIndex < 0) return source;
  return dedentPythonBlock(takeUntilTemplateReturn(lines.slice(customSpecsIndex + 1)).join('\n'));
}

const LEAKED_SCHEMA_FIELDS = /^\s*(covered_constraint_ids|plan_summary|assumptions)\s*=/;

function stripLeakedSchemaFields(source: string): string {
  return source
    .split('\n')
    .filter((line) => !LEAKED_SCHEMA_FIELDS.test(line))
    .join('\n');
}

export function normalizeConstraintCodeBody(constraintCode: string): string {
  let normalized = normalizeLineEndings(stripMarkdownFence(constraintCode));
  normalized = stripFullSkeletonBoilerplate(normalized);
  normalized = extractBuildCustomConstraintsBody(normalized);
  normalized = stripFullSkeletonBoilerplate(normalized);
  normalized = trimExplanatoryProse(normalized);
  normalized = stripLeakedSchemaFields(normalized);
  normalized = dedentPythonBlock(stripMarkdownFence(normalized));
  return normalized.trim() ? normalized : 'pass';
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
