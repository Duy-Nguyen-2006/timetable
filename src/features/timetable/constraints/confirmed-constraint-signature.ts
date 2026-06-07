import { constraintSignature, stableHash } from '../ai/local-agent-utils';
import type { ConfirmedConstraint } from '../ai/constraint-review-types';

/** Hash cho cache solver — chỉ specs đã xác nhận, không raw text chưa confirm. */
export function digestConfirmedConstraintSpecs(confirmed: ConfirmedConstraint[]): string {
  const specs = confirmed.flatMap((c) => c.specs);
  const signatures = specs.map((s) => constraintSignature(s)).sort((a, b) => a.localeCompare(b));
  return stableHash(signatures);
}
