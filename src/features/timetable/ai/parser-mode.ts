/**
 * parser-mode.ts — M8 parser mode feature flag
 *
 * Per Plan_v2.md M8.1, the parser authority can be one of:
 *   - 'legacy'   : only legacy built-in parser runs
 *   - 'shadow'   : both run, legacy is authoritative, IR-first logs divergence
 *   - 'ir_first' : IR-first is authoritative, legacy is unused (except for tests)
 *
 * The default is 'shadow' — this is the M6/M7 verification mode.
 * The flip happens when M6 silentFlipRate == 0 AND golden V2 passes
 * AND solver gate is fail-closed AND no solve-time LLM/codegen.
 *
 * The mode can be overridden at runtime via:
 *   - Environment variable CONSTRAINT_PARSER_MODE
 *   - This module's setter (used by tests)
 */

export type ParserMode = 'legacy' | 'shadow' | 'ir_first';

const VALID_MODES: ReadonlySet<ParserMode> = new Set<ParserMode>([
  'legacy',
  'shadow',
  'ir_first',
]);

let _mode: ParserMode = readDefault();

function readDefault(): ParserMode {
  if (typeof process !== 'undefined' && process.env) {
    const env = process.env.CONSTRAINT_PARSER_MODE;
    if (env && VALID_MODES.has(env as ParserMode)) {
      return env as ParserMode;
    }
  }
  // Per plan: default is 'shadow' (M6/M7 verification mode)
  return 'shadow';
}

export function getParserMode(): ParserMode {
  return _mode;
}

export function setParserMode(mode: ParserMode): void {
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid parser mode: ${mode}. Valid: ${[...VALID_MODES].join(', ')}`);
  }
  _mode = mode;
}

export function resetParserMode(): void {
  _mode = readDefault();
}

/**
 * Is the IR-first parser currently authoritative? Used by parse-pipeline
 * to decide which result to return to the user.
 */
export function isIRFirstAuthoritative(): boolean {
  return _mode === 'ir_first';
}

/**
 * Should the shadow mode run? Always true except in pure 'legacy' mode.
 */
export function isShadowModeEnabled(): boolean {
  return _mode !== 'legacy';
}
