/**
 * semantic-direction.test.ts — Test coverage for semantic direction analyzer
 *
 * Covers all canonical Vietnamese phrases (accented + unaccented) for each
 * direction category: require, block, only, prefer, unknown, contradictory.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeSemanticDirection,
  hasRequireMarker,
  hasBlockMarker,
  hasOnlyMarker,
  hasPreferMarker,
  hasContradiction,
} from './semantic-direction';

// ─── REQUIRE FAMILY ─────────────────────────────────────────────────────
test('require direction: phai co', () => {
  const r = analyzeSemanticDirection('Thầy Sơn phải có tiết 4');
  assert.equal(r.direction, 'require');
  assert.ok(r.confidence > 0.85);
  assert.equal(r.hasConflict, false);
  assert.ok(r.matched.require.length > 0);
});

test('require direction: phai co (unaccented)', () => {
  const r = analyzeSemanticDirection('Thầy Sơn phai co tiết 4');
  assert.equal(r.direction, 'require');
  assert.ok(r.confidence > 0.85);
});

test('require direction: can co', () => {
  const r = analyzeSemanticDirection('Cô Thúy cần có tiết 1');
  assert.equal(r.direction, 'require');
});

test('require direction: can co (unaccented)', () => {
  const r = analyzeSemanticDirection('Cô Thúy can co tiết 1');
  assert.equal(r.direction, 'require');
});

test('require direction: it nhat trong tuan', () => {
  const r = analyzeSemanticDirection('Lớp 6A phải có ít nhất 1 tiết 4 trong tuần');
  assert.equal(r.direction, 'require');
});

test('require direction: it nhat (unaccented)', () => {
  const r = analyzeSemanticDirection('Lớp 6A phai co it nhat 1 tiết 4 trong tuần');
  assert.equal(r.direction, 'require');
});

test('require direction: co it nhat', () => {
  const r = analyzeSemanticDirection('Cô Thủy có ít nhất 1 tiết 4');
  assert.equal(r.direction, 'require');
});

test('require direction: co it nhat (unaccented)', () => {
  const r = analyzeSemanticDirection('Co it nhat 1 tiết 4');
  assert.equal(r.direction, 'require');
});

test('require direction: bat buoc co', () => {
  const r = analyzeSemanticDirection('Bắt buộc cô Thủy có tiết 4');
  assert.equal(r.direction, 'require');
});

test('require direction: bat buoc co (unaccented)', () => {
  const r = analyzeSemanticDirection('Bat buoc co tiết 4');
  assert.equal(r.direction, 'require');
});

test('require direction: phai duoc xep', () => {
  const r = analyzeSemanticDirection('Thầy Sơn phải được xếp tiết 1');
  assert.equal(r.direction, 'require');
});

test('require direction: phai duoc xep (unaccented)', () => {
  const r = analyzeSemanticDirection('Phai duoc xếp tiết 1');
  assert.equal(r.direction, 'require');
});

test('require direction: nhat dinh phai', () => {
  const r = analyzeSemanticDirection('Nhất định phải có tiết 4');
  assert.equal(r.direction, 'require');
});

test('require direction: nhat dinh phai (unaccented)', () => {
  const r = analyzeSemanticDirection('Nhat dinh phai có tiết 4');
  assert.equal(r.direction, 'require');
});

test('require direction: toi thieu', () => {
  const r = analyzeSemanticDirection('Tối thiểu 2 tiết');
  assert.equal(r.direction, 'require');
});

test('require direction: toi thieu (unaccented)', () => {
  const r = analyzeSemanticDirection('Toi thieu 2 tiết');
  assert.equal(r.direction, 'require');
});

test('hasRequireMarker convenience wrapper', () => {
  assert.equal(hasRequireMarker('Thầy Sơn phải có tiết 4'), true);
  assert.equal(hasRequireMarker('Thầy Sơn không dạy tiết 4'), false);
});

// ─── BLOCK FAMILY ───────────────────────────────────────────────────────
test('block direction: khong day', () => {
  const r = analyzeSemanticDirection('Thầy Sơn không dạy tiết 4');
  assert.equal(r.direction, 'block');
  assert.ok(r.confidence > 0.8);
});

test('block direction: khong day (unaccented)', () => {
  const r = analyzeSemanticDirection('Thầy Sơn khong day tiết 4');
  assert.equal(r.direction, 'block');
});

test('block direction: ko day', () => {
  const r = analyzeSemanticDirection('Thầy Sơn ko dạy tiết 4');
  assert.equal(r.direction, 'block');
});

test('block direction: cam', () => {
  const r = analyzeSemanticDirection('Cấm dạy tiết 4');
  assert.equal(r.direction, 'block');
});

test('block direction: cam (unaccented)', () => {
  const r = analyzeSemanticDirection('Cam dạy tiết 4');
  assert.equal(r.direction, 'block');
});

test('block direction: nghi', () => {
  const r = analyzeSemanticDirection('Cô Thúy nghỉ thứ 5');
  assert.equal(r.direction, 'block');
});

test('block direction: nghi (unaccented)', () => {
  const r = analyzeSemanticDirection('Cô Thúy nghi thứ 5');
  assert.equal(r.direction, 'block');
});

test('block direction: dung xep', () => {
  const r = analyzeSemanticDirection('Đừng xếp tiết 1');
  assert.equal(r.direction, 'block');
});

test('block direction: tranh tiet cuoi', () => {
  const r = analyzeSemanticDirection('Tránh tiết cuối');
  assert.equal(r.direction, 'block');
});

test('block direction: tranh (unaccented)', () => {
  const r = analyzeSemanticDirection('Tranh tiết cuối');
  assert.equal(r.direction, 'block');
});

test('block direction: ne', () => {
  const r = analyzeSemanticDirection('Né tiết 5');
  assert.equal(r.direction, 'block');
});

test('block direction: ne (unaccented)', () => {
  const r = analyzeSemanticDirection('Ne tiết 5');
  assert.equal(r.direction, 'block');
});

test('block direction: dung xep', () => {
  const r = analyzeSemanticDirection('Dừng xếp tiết 1');
  assert.equal(r.direction, 'block');
});

test('block direction: khong hoc class', () => {
  const r = analyzeSemanticDirection('Lớp 6A không học tiết 5');
  assert.equal(r.direction, 'block');
});

test('block direction: khong hoc class (unaccented)', () => {
  const r = analyzeSemanticDirection('Lớp 6A khong hoc tiết 5');
  assert.equal(r.direction, 'block');
});

test('hasBlockMarker convenience wrapper', () => {
  assert.equal(hasBlockMarker('Thầy Sơn không dạy tiết 4'), true);
  assert.equal(hasBlockMarker('Thầy Sơn phải có tiết 4'), false);
});

// ─── ONLY FAMILY ────────────────────────────────────────────────────────
test('only direction: chi day nhieu tiet', () => {
  const r = analyzeSemanticDirection('Cô Thúy chỉ dạy các tiết 2, 3, 4');
  assert.equal(r.direction, 'only');
  assert.ok(r.confidence > 0.9);
});

test('only direction: chi day (unaccented)', () => {
  const r = analyzeSemanticDirection('Cô Thúy chi day các tiết 2, 3, 4');
  assert.equal(r.direction, 'only');
});

test('only direction: chi duoc day', () => {
  const r = analyzeSemanticDirection('Thầy Sơn chỉ được dạy tiết 4');
  assert.equal(r.direction, 'only');
});

test('only direction: chi duoc day (unaccented)', () => {
  const r = analyzeSemanticDirection('Thầy Sơn chi duoc day tiết 4');
  assert.equal(r.direction, 'only');
});

test('only direction: chi hoc', () => {
  const r = analyzeSemanticDirection('Lớp 6A chỉ học các tiết 2, 3, 4');
  assert.equal(r.direction, 'only');
});

test('only direction: chi hoc (unaccented)', () => {
  const r = analyzeSemanticDirection('Lớp 6A chi hoc các tiết 2, 3, 4');
  assert.equal(r.direction, 'only');
});

test('only direction: chi ranh', () => {
  const r = analyzeSemanticDirection('Lớp 6A chỉ rảnh tiết 3');
  assert.equal(r.direction, 'only');
});

test('only direction: co dinh', () => {
  const r = analyzeSemanticDirection('Cố định vào Thứ 2 tiết 1');
  assert.equal(r.direction, 'only');
});

test('only direction: co dinh (unaccented)', () => {
  const r = analyzeSemanticDirection('Co dinh vào Thứ 2 tiết 1');
  assert.equal(r.direction, 'only');
});

test('only direction: whitelist', () => {
  const r = analyzeSemanticDirection('Whitelist tiết 2, 3');
  assert.equal(r.direction, 'only');
});

test('hasOnlyMarker convenience wrapper', () => {
  assert.equal(hasOnlyMarker('Cô Thúy chỉ dạy tiết 4'), true);
  assert.equal(hasOnlyMarker('Cô Thúy phải có tiết 4'), false);
});

// ─── PREFER FAMILY ──────────────────────────────────────────────────────
test('prefer direction: uu tien', () => {
  const r = analyzeSemanticDirection('Ưu tiên xếp thầy Sơn vào các tiết 2, 3');
  assert.equal(r.direction, 'prefer');
  assert.ok(r.confidence > 0.8);
});

test('prefer direction: uu tien (unaccented)', () => {
  const r = analyzeSemanticDirection('Uu tien xếp thầy Sơn vào các tiết 2, 3');
  assert.equal(r.direction, 'prefer');
});

test('prefer direction: nen day', () => {
  const r = analyzeSemanticDirection('Cô Thúy nên dạy tiết 4');
  assert.equal(r.direction, 'prefer');
});

test('prefer direction: nen (unaccented)', () => {
  const r = analyzeSemanticDirection('Cô Thúy nen dạy tiết 4');
  assert.equal(r.direction, 'prefer');
});

test('prefer direction: thich', () => {
  const r = analyzeSemanticDirection('Thích dạy tiết sáng');
  assert.equal(r.direction, 'prefer');
});

test('prefer direction: thich (unaccented)', () => {
  const r = analyzeSemanticDirection('Thich dạy tiết sáng');
  assert.equal(r.direction, 'prefer');
});

test('prefer direction: muon', () => {
  const r = analyzeSemanticDirection('Muốn dạy tiết 2');
  assert.equal(r.direction, 'prefer');
});

test('prefer direction: muon (unaccented)', () => {
  const r = analyzeSemanticDirection('Muon dạy tiết 2');
  assert.equal(r.direction, 'prefer');
});

test('prefer direction: prefer (English)', () => {
  const r = analyzeSemanticDirection('Prefer morning slots');
  assert.equal(r.direction, 'prefer');
});

test('hasPreferMarker convenience wrapper', () => {
  assert.equal(hasPreferMarker('Ưu tiên tiết 4'), true);
  assert.equal(hasPreferMarker('Thầy Sơn phải có tiết 4'), false);
});

// ─── UNKNOWN FAMILY ─────────────────────────────────────────────────────
test('unknown direction: teacher class assignment', () => {
  const r = analyzeSemanticDirection('Thầy Sơn dạy lớp 6A');
  assert.equal(r.direction, 'unknown');
  assert.equal(r.confidence, 0);
  assert.equal(r.hasConflict, false);
});

test('unknown direction: bare period', () => {
  const r = analyzeSemanticDirection('Tiết 4');
  assert.equal(r.direction, 'unknown');
});

test('unknown direction: bare subject', () => {
  const r = analyzeSemanticDirection('Môn Toán');
  assert.equal(r.direction, 'unknown');
});

test('unknown direction: empty string', () => {
  const r = analyzeSemanticDirection('');
  assert.equal(r.direction, 'unknown');
});

// ─── CONTRADICTORY FAMILY ───────────────────────────────────────────────
test('contradictory direction: phai co + khong day', () => {
  const r = analyzeSemanticDirection('Thầy Sơn phải có tiết 4 nhưng không dạy tiết 4');
  assert.equal(r.direction, 'contradictory');
  assert.equal(r.confidence, 0);
  assert.equal(r.hasConflict, true);
  assert.ok(r.matched.require.length > 0);
  assert.ok(r.matched.block.length > 0);
});

test('contradictory direction: phai co + cam', () => {
  const r = analyzeSemanticDirection('Thầy Sơn phai co tiết 4 và cam tiết 4');
  assert.equal(r.direction, 'contradictory');
});

test('contradictory direction: can co + ko day', () => {
  const r = analyzeSemanticDirection('Cô Thúy cần có tiết 1 nhưng ko dạy tiết 1');
  assert.equal(r.direction, 'contradictory');
});

test('contradictory direction: it nhat + khong hoc', () => {
  const r = analyzeSemanticDirection('Lớp 6A phải có ít nhất 1 tiết 4 và không học tiết 4');
  assert.equal(r.direction, 'contradictory');
});

test('hasContradiction convenience wrapper', () => {
  assert.equal(hasContradiction('Thầy Sơn phải có tiết 4 nhưng không dạy tiết 4'), true);
  assert.equal(hasContradiction('Thầy Sơn phải có tiết 4'), false);
});

// ─── EDGE CASES ─────────────────────────────────────────────────────────
test('edge case: whitespace normalization', () => {
  const r1 = analyzeSemanticDirection('Thầy  Sơn   phải   có   tiết   4');
  const r2 = analyzeSemanticDirection('Thầy Sơn phải có tiết 4');
  assert.equal(r1.direction, r2.direction);
  assert.equal(r1.confidence, r2.confidence);
});

test('edge case: case insensitivity', () => {
  const r1 = analyzeSemanticDirection('THẦY SƠN PHẢI CÓ TIẾT 4');
  const r2 = analyzeSemanticDirection('thầy sơn phải có tiết 4');
  assert.equal(r1.direction, r2.direction);
});

test('edge case: prefer does not conflict with require (prefer is weaker)', () => {
  const r = analyzeSemanticDirection('Thầy Sơn phải có tiết 4 và nên dạy sáng');
  assert.equal(r.direction, 'require');
});

test('edge case: prefer does not conflict with block (prefer is weaker)', () => {
  const r = analyzeSemanticDirection('Thầy Sơn không dạy tiết 1 nhưng nên dạy tiết 2');
  assert.equal(r.direction, 'block');
});

// ─── REAL-WORLD VIETNAMESE SENTENCES ───────────────────────────────────
test('real-world: Cô Thủy phải có tiết 4', () => {
  const r = analyzeSemanticDirection('Cô Thủy phải có tiết 4');
  assert.equal(r.direction, 'require');
  assert.ok(r.confidence > 0.95);
});

test('real-world: Thầy Sơn không dạy thứ 2 tiết 1', () => {
  const r = analyzeSemanticDirection('Thầy Sơn không dạy thứ 2 tiết 1');
  assert.equal(r.direction, 'block');
  assert.ok(r.confidence > 0.95);
});

test('real-world: Lớp 6A chỉ học các tiết 2, 3, 4', () => {
  const r = analyzeSemanticDirection('Lớp 6A chỉ học các tiết 2, 3, 4');
  assert.equal(r.direction, 'only');
  assert.ok(r.confidence > 0.95);
});

test('real-world: Ưu tiên xếp môn Văn vào các tiết 3, 4', () => {
  const r = analyzeSemanticDirection('Ưu tiên xếp môn Văn vào các tiết 3, 4');
  assert.equal(r.direction, 'prefer');
  assert.ok(r.confidence > 0.9);
});

test('real-world: Môn Toán → unknown', () => {
  const r = analyzeSemanticDirection('Môn Toán');
  assert.equal(r.direction, 'unknown');
  assert.equal(r.confidence, 0);
});

test('real-world: Thầy Sơn phải có tiết 4 nhưng không dạy tiết 4', () => {
  const r = analyzeSemanticDirection('Thầy Sơn phải có tiết 4 nhưng không dạy tiết 4');
  assert.equal(r.direction, 'contradictory');
  assert.equal(r.confidence, 0);
});

// ─── EXPLANATION FIELD ──────────────────────────────────────────────────
test('explanation: require mentions phải có', () => {
  const r = analyzeSemanticDirection('Thầy Sơn phải có tiết 4');
  assert.ok(r.explanation.includes('phải có'));
});

test('explanation: block mentions không', () => {
  const r = analyzeSemanticDirection('Thầy Sơn không dạy tiết 4');
  assert.ok(r.explanation.includes('không'));
});

test('explanation: only mentions chỉ', () => {
  const r = analyzeSemanticDirection('Cô Thúy chỉ dạy tiết 4');
  assert.ok(r.explanation.includes('chỉ'));
});

test('explanation: prefer mentions ưu tiên', () => {
  const r = analyzeSemanticDirection('Ưu tiên tiết 4');
  assert.ok(r.explanation.includes('ưu tiên'));
});

test('explanation: unknown mentions no markers', () => {
  const r = analyzeSemanticDirection('Môn Toán');
  assert.ok(r.explanation.includes('Không phát hiện'));
});

test('explanation: contradictory mentions cannot decide', () => {
  const r = analyzeSemanticDirection('Thầy Sơn phải có tiết 4 nhưng không dạy tiết 4');
  assert.ok(r.explanation.includes('không thể tự quyết định nghĩa'));
});
