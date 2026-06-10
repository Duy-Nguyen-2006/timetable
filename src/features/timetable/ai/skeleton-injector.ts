/**
 * skeleton-injector.ts (a.k.a. solver-template-loader)
 *
 * The AI codegen pipeline was removed; this module now only loads the fixed
 * solver skeleton template and replaces the `<<<AI_FILL_HERE>>>` marker
 * (or its legacy `CUSTOM_CONSTRAINTS_DISABLED` successor) with `pass`.
 *
 * Kept name as `skeleton-injector.ts` for backward compatibility with
 * existing imports, but the API is intentionally minimal:
 *   - `loadSolverSkeleton()` — fetch the template.
 *   - `injectEmptyCustomConstraintBlock(skeleton)` — replace the custom
 *     constraint marker with `pass`.
 */

const MARKER_LINE = /^[ \t]*#\s*<<<\s*AI_FILL_HERE\s*>>>\s*$/m;
const CUSTOM_CONSTRAINT_DISABLED_LINE = /^[ \t]*#\s*<<<\s*CUSTOM_CONSTRAINTS_DISABLED\s*>>>\s*$/m;
const ANY_CUSTOM_MARKER = new RegExp(
  [MARKER_LINE.source, CUSTOM_CONSTRAINT_DISABLED_LINE.source].join('|'),
  'm'
);

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

/**
 * Replace the custom constraint injection marker in the skeleton with `pass`.
 * Returns `{ injected: false, ... }` if the marker is missing — the caller
 * should treat this as a fatal template error.
 *
 * Kept for backward compatibility with the historical name
 * `injectConstraintCode`; new code should prefer the more accurate
 * `injectEmptyCustomConstraintBlock`.
 */
export function injectConstraintCode(
  skeleton: string,
  _unused: string
): { solverCode: string; injected: boolean } {
  return injectEmptyCustomConstraintBlock(skeleton);
}

export function injectEmptyCustomConstraintBlock(
  skeleton: string
): { solverCode: string; injected: boolean } {
  const match = skeleton.match(ANY_CUSTOM_MARKER);
  if (!match) return { solverCode: skeleton, injected: false };
  const baseIndent = (match[0].match(/^[ \t]*/)?.[0] ?? '') || '';
  return {
    solverCode: skeleton.replace(ANY_CUSTOM_MARKER, () => `${baseIndent}pass`),
    injected: true,
  };
}
