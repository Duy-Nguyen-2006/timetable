/**
 * deterministic-solver-eligibility.ts
 *
 * Quyết định một batch ConstraintSpec có thể chạy qua deterministic solver
 * (CP-SAT + skeleton cố định) hay không.
 *
 * Default solve path chỉ chấp nhận batch `eligible`. Batch không eligible
 * sẽ bị reject sớm ở `local-agent.ts` (fail-closed) — không còn nhánh
 * AI codegen để fallback.
 */

import { SOLVER_ENCODABLE_KINDS } from './constraint-registry';
import type { ConstraintSpec } from './constraint-spec';
import { isDeterministicallyCheckedKind } from './deterministic-validator';

export type DeterministicEligibility =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      hardCustomSpecs: ConstraintSpec[];
      unsupportedHardSpecs: ConstraintSpec[];
      hardUncheckedSpecs: ConstraintSpec[];
    };

/**
 * Trả về:
 *   - `{ ok: true }` nếu MỌI hard constraint đều:
 *       + không phải custom_dsl, hoặc
 *       + custom_dsl có IR expr/pythonPredicate để solver deterministic kiểm tra; VÀ
 *       + thuộc SOLVER_ENCODABLE_KINDS; VÀ
 *       + có deterministic checker.
 *   - `{ ok: false, reason, ... }` nếu có bất kỳ hard constraint nào không
 *     đủ điều kiện trên.
 *
 * Soft constraint không bao giờ block eligibility — solver sẽ chạy và
 * deterministic validator sẽ surface chúng như unchecked/warning.
 */
export function getDeterministicEligibility(
  specs: readonly ConstraintSpec[]
): DeterministicEligibility {
  const hardSpecs = specs.filter((spec) => spec.severity === 'hard');

  const hardCustomSpecs = hardSpecs.filter((spec) => {
    if (spec.kind !== 'custom_dsl') return false;
    const params = spec.params ?? {};
    return (
      !(params.expr && typeof params.expr === 'object') &&
      typeof params.pythonPredicate !== 'string' &&
      !spec.pythonPredicate
    );
  });

  const unsupportedHardSpecs = hardSpecs.filter(
    (spec) =>
      spec.kind !== 'custom_dsl' &&
      !SOLVER_ENCODABLE_KINDS.has(spec.kind)
  );

  const hardUncheckedSpecs = hardSpecs.filter(
    (spec) =>
      spec.kind !== 'custom_dsl' &&
      SOLVER_ENCODABLE_KINDS.has(spec.kind) &&
      !isDeterministicallyCheckedKind(spec.kind)
  );

  if (
    hardCustomSpecs.length === 0 &&
    unsupportedHardSpecs.length === 0 &&
    hardUncheckedSpecs.length === 0
  ) {
    return { ok: true };
  }

  const parts: string[] = [];

  if (hardCustomSpecs.length > 0) {
    parts.push(
      `${hardCustomSpecs.length} ràng buộc custom_dsl hard chưa được hỗ trợ vì chưa có IR expr/pythonPredicate để solver deterministic kiểm tra`
    );
  }

  if (unsupportedHardSpecs.length > 0) {
    parts.push(
      `${unsupportedHardSpecs.length} ràng buộc hard chưa được mã hóa CP-SAT`
    );
  }

  if (hardUncheckedSpecs.length > 0) {
    parts.push(
      `${hardUncheckedSpecs.length} ràng buộc hard chưa có deterministic checker`
    );
  }

  return {
    ok: false,
    reason: `Không thể chạy solver deterministic: ${parts.join('; ')}.`,
    hardCustomSpecs,
    unsupportedHardSpecs,
    hardUncheckedSpecs,
  };
}

/**
 * Tiện ích nhỏ: chỉ trả boolean. Dùng khi caller không cần chi tiết reason.
 */
export function isDeterministicallyEligible(specs: readonly ConstraintSpec[]): boolean {
  return getDeterministicEligibility(specs).ok;
}

// Re-export để caller có thể dùng helper isSolverEncodableKind mà không
// phải import trực tiếp từ constraint-registry (giữ ổn định interface).
export { isSolverEncodableKind };
