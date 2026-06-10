/**
 * parser-mode.test.ts — M8 parser mode feature flag
 *
 * Per Plan_v2.md M8, the parser mode can be one of:
 *   - 'legacy'   : only legacy runs
 *   - 'shadow'   : both run, legacy is authoritative (default)
 *   - 'ir_first' : IR-first is authoritative
 *
 * These tests verify the mode flag works correctly and can be toggled
 * for rollback. Per M8.5, the flag must be reversible without
 * redeployment.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getParserMode,
  setParserMode,
  resetParserMode,
  isIRFirstAuthoritative,
  isShadowModeEnabled,
  type ParserMode,
} from './parser-mode';

test('M8.1: default mode is shadow', () => {
  resetParserMode();
  assert.equal(getParserMode(), 'shadow');
});

test('M8.1: setParserMode accepts valid modes', () => {
  for (const mode of ['legacy', 'shadow', 'ir_first'] as ParserMode[]) {
    setParserMode(mode);
    assert.equal(getParserMode(), mode);
  }
});

test('M8.1: setParserMode rejects invalid modes', () => {
  assert.throws(
    () => setParserMode('bogus' as ParserMode),
    /Invalid parser mode/
  );
});

test('M8.2: isIRFirstAuthoritative reflects mode', () => {
  setParserMode('legacy');
  assert.equal(isIRFirstAuthoritative(), false);
  setParserMode('shadow');
  assert.equal(isIRFirstAuthoritative(), false);
  setParserMode('ir_first');
  assert.equal(isIRFirstAuthoritative(), true);
  resetParserMode();
});

test('M8.2: isShadowModeEnabled reflects mode', () => {
  setParserMode('legacy');
  assert.equal(isShadowModeEnabled(), false);
  setParserMode('shadow');
  assert.equal(isShadowModeEnabled(), true);
  setParserMode('ir_first');
  assert.equal(isShadowModeEnabled(), true);
  resetParserMode();
});

test('M8.5: rollback works without side effects', () => {
  // Start in default
  resetParserMode();
  assert.equal(getParserMode(), 'shadow');

  // Flip to ir_first
  setParserMode('ir_first');
  assert.equal(getParserMode(), 'ir_first');

  // Rollback to legacy (M8.5: production can switch to legacy)
  setParserMode('legacy');
  assert.equal(getParserMode(), 'legacy');

  // Back to default
  resetParserMode();
  assert.equal(getParserMode(), 'shadow');
});

test('M8: resetParserMode restores default', () => {
  setParserMode('ir_first');
  resetParserMode();
  assert.equal(getParserMode(), 'shadow');
});
