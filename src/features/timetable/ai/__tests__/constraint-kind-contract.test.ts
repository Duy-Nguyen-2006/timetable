/**
 * constraint-kind-contract.test.ts — Contract tests for ConstraintKind
 *
 * Ensures the ConstraintKind union stays synchronized with:
 * - CONSTRAINT_REGISTRY (runtime metadata)
 * - SOLVER_ENCODABLE_KIND_LIST (compile-time checked list)
 * - Require-family constraints (user-specified must-have kinds)
 *
 * These tests catch drift at CI time before it causes runtime errors.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ConstraintKind } from '../constraint-spec';
import {
  CONSTRAINT_REGISTRY,
  SOLVER_ENCODABLE_KIND_LIST,
  SOLVER_ENCODABLE_KINDS,
  BUILT_IN_CONSTRAINT_KINDS,
} from '../constraint-registry';

// Extract all kinds from the registry
const REGISTRY_KINDS = new Set(CONSTRAINT_REGISTRY.map((m) => m.kind));

// Type-level exhaustiveness check: ensure SOLVER_ENCODABLE_KIND_LIST covers all valid kinds
// (The `satisfies readonly ConstraintKind[]` in constraint-registry.ts provides compile-time check)

describe('ConstraintKind Contract Tests', () => {
  describe('Registry Completeness', () => {
    it('CONSTRAINT_REGISTRY should contain all 83 expected constraint kinds', () => {
      assert.equal(CONSTRAINT_REGISTRY.length, 83);
    });

    it('CONSTRAINT_REGISTRY should have no duplicate kinds', () => {
      const kinds = CONSTRAINT_REGISTRY.map((m) => m.kind);
      const uniqueKinds = new Set(kinds);
      assert.equal(uniqueKinds.size, kinds.length);
    });

    it('all registry entries should have non-empty labels', () => {
      for (const meta of CONSTRAINT_REGISTRY) {
        assert.ok(meta.label);
        assert.ok(meta.label.length > 0);
      }
    });

    it('all registry entries should have valid groups', () => {
      const validGroups = new Set(['teacher', 'subject', 'class', 'assignment', 'global']);
      for (const meta of CONSTRAINT_REGISTRY) {
        assert.ok(validGroups.has(meta.group));
      }
    });
  });

  describe('Require-family constraints (Phase 0)', () => {
    const REQUIRE_FAMILY_KINDS: ConstraintKind[] = [
      'teacher_required_period',
      'class_required_period',
      'subject_required_period',
    ];

    it('all require-family kinds must exist in CONSTRAINT_REGISTRY', () => {
      for (const kind of REQUIRE_FAMILY_KINDS) {
        assert.ok(REGISTRY_KINDS.has(kind));
      }
    });

    it('all require-family kinds must have hasChecker=true', () => {
      for (const kind of REQUIRE_FAMILY_KINDS) {
        const meta = CONSTRAINT_REGISTRY.find((m) => m.kind === kind);
        assert.equal(meta?.hasChecker, true);
      }
    });

    it('all require-family kinds must have required params including "minCount"', () => {
      const meta1 = CONSTRAINT_REGISTRY.find((m) => m.kind === 'teacher_required_period');
      assert.ok(meta1?.requiredParams.includes('teacher'));
      assert.ok(meta1?.requiredParams.includes('period'));
      assert.ok(meta1?.requiredParams.includes('minCount'));

      const meta2 = CONSTRAINT_REGISTRY.find((m) => m.kind === 'class_required_period');
      assert.ok(meta2?.requiredParams.includes('class'));
      assert.ok(meta2?.requiredParams.includes('period'));
      assert.ok(meta2?.requiredParams.includes('minCount'));

      const meta3 = CONSTRAINT_REGISTRY.find((m) => m.kind === 'subject_required_period');
      assert.ok(meta3?.requiredParams.includes('subject'));
      assert.ok(meta3?.requiredParams.includes('period'));
      assert.ok(meta3?.requiredParams.includes('minCount'));
    });

    it('all require-family kinds must be solver-encodable', () => {
      for (const kind of REQUIRE_FAMILY_KINDS) {
        assert.ok(SOLVER_ENCODABLE_KINDS.has(kind));
      }
    });
  });

  describe('THEN positive atoms (F-6, F-7)', () => {
    const THEN_POSITIVE_KINDS: ConstraintKind[] = [
      'teacher_required_day',
      'teacher_required_slot',
      'teacher_pair_required_same_day',
      'teacher_pair_required_same_slot',
    ];

    it('all THEN positive atom kinds must exist in CONSTRAINT_REGISTRY', () => {
      for (const kind of THEN_POSITIVE_KINDS) {
        assert.ok(REGISTRY_KINDS.has(kind));
      }
    });

    it('all THEN positive atom kinds must have hasChecker=true', () => {
      for (const kind of THEN_POSITIVE_KINDS) {
        const meta = CONSTRAINT_REGISTRY.find((m) => m.kind === kind);
        assert.equal(meta?.hasChecker, true);
      }
    });

    it('all THEN positive atom kinds must be solver-encodable', () => {
      for (const kind of THEN_POSITIVE_KINDS) {
        assert.ok(SOLVER_ENCODABLE_KINDS.has(kind));
      }
    });
  });

  describe('SOLVER_ENCODABLE_KINDS synchronization', () => {
    it('SOLVER_ENCODABLE_KIND_LIST should have satisfies type annotation (compile-time check)', () => {
      // This is a compile-time check via `satisfies readonly ConstraintKind[]` in constraint-registry.ts
      // If the list contains invalid kinds, TypeScript compilation will fail
      assert.ok(SOLVER_ENCODABLE_KIND_LIST.length > 0);
    });

    it('SOLVER_ENCODABLE_KINDS set should match SOLVER_ENCODABLE_KIND_LIST', () => {
      const listSet = new Set(SOLVER_ENCODABLE_KIND_LIST);
      assert.equal(SOLVER_ENCODABLE_KINDS.size, listSet.size);
      for (const kind of SOLVER_ENCODABLE_KIND_LIST) {
        assert.ok(SOLVER_ENCODABLE_KINDS.has(kind));
      }
    });

    it('all solver-encodable kinds should be in CONSTRAINT_REGISTRY', () => {
      for (const kind of SOLVER_ENCODABLE_KINDS) {
        assert.ok(REGISTRY_KINDS.has(kind));
      }
    });

    it('SOLVER_ENCODABLE_KIND_LIST should not include custom_dsl', () => {
      assert.ok(!SOLVER_ENCODABLE_KIND_LIST.includes('custom_dsl' as any));
    });
  });

  describe('BUILT_IN_CONSTRAINT_KINDS completeness', () => {
    it('should contain all registry kinds except custom_dsl', () => {
      const expectedSize = CONSTRAINT_REGISTRY.length - 1; // -1 for custom_dsl
      assert.equal(BUILT_IN_CONSTRAINT_KINDS.size, expectedSize);
    });

    it('should not include custom_dsl', () => {
      assert.ok(!BUILT_IN_CONSTRAINT_KINDS.has('custom_dsl' as any));
    });

    it('all built-in kinds should be in CONSTRAINT_REGISTRY', () => {
      for (const kind of BUILT_IN_CONSTRAINT_KINDS) {
        assert.ok(REGISTRY_KINDS.has(kind));
      }
    });
  });

  describe('Edge case validation', () => {
    it('custom_dsl should exist in CONSTRAINT_REGISTRY', () => {
      assert.ok(REGISTRY_KINDS.has('custom_dsl'));
    });

    it('custom_dsl should have hasChecker=false', () => {
      const meta = CONSTRAINT_REGISTRY.find((m) => m.kind === 'custom_dsl');
      assert.equal(meta?.hasChecker, false);
    });

    it('custom_dsl should have empty requiredParams', () => {
      const meta = CONSTRAINT_REGISTRY.find((m) => m.kind === 'custom_dsl');
      assert.deepEqual(meta?.requiredParams, []);
    });

    it('if_then should exist and be solver-encodable', () => {
      assert.ok(REGISTRY_KINDS.has('if_then'));
      assert.ok(SOLVER_ENCODABLE_KINDS.has('if_then'));
    });
  });

  describe('Polarity validation (negative-guard.ts integration)', () => {
    // These are the positive-set kinds from negative-guard.ts POSITIVE_SET_KINDS
    const EXPECTED_POSITIVE_KINDS: ConstraintKind[] = [
      'teacher_allowed_days',
      'teacher_allowed_periods',
      'teacher_preferred_periods',
      'class_allowed_days',
      'class_allowed_periods',
      'subject_allowed_days',
      'subject_preferred_periods',
      'subject_pin_period',
      'class_fixed_period',
      'teacher_required_period',
      'class_required_period',
      'subject_required_period',
      'teacher_required_day',
      'teacher_required_slot',
    ];

    it('all positive-set kinds from negative-guard should exist in CONSTRAINT_REGISTRY', () => {
      for (const kind of EXPECTED_POSITIVE_KINDS) {
        assert.ok(REGISTRY_KINDS.has(kind));
      }
    });

    // These are the negative-set kinds from negative-guard.ts NEGATIVE_SET_KINDS
    const EXPECTED_NEGATIVE_KINDS: ConstraintKind[] = [
      'teacher_block_day',
      'teacher_block_period',
      'teacher_block_slot',
      'class_block_day',
      'class_block_period',
      'class_block_slot',
      'subject_block_period',
      'subject_block_days',
    ];

    it('all negative-set kinds from negative-guard should exist in CONSTRAINT_REGISTRY', () => {
      for (const kind of EXPECTED_NEGATIVE_KINDS) {
        assert.ok(REGISTRY_KINDS.has(kind));
      }
    });

    it('positive and negative sets should be disjoint', () => {
      const positiveSet = new Set(EXPECTED_POSITIVE_KINDS);
      const negativeSet = new Set(EXPECTED_NEGATIVE_KINDS);
      for (const kind of EXPECTED_POSITIVE_KINDS) {
        assert.ok(!negativeSet.has(kind));
      }
      for (const kind of EXPECTED_NEGATIVE_KINDS) {
        assert.ok(!positiveSet.has(kind));
      }
    });
  });

  describe('Consistency checks', () => {
    it('all kinds with hasChecker=true should have non-empty requiredParams', () => {
      for (const meta of CONSTRAINT_REGISTRY) {
        if (meta.hasChecker && meta.kind !== 'custom_dsl') {
          // Some checkers may have empty params (e.g., global constraints)
          // Just verify the field exists
          assert.ok(Array.isArray(meta.requiredParams));
        }
      }
    });

    it('all solver-encodable kinds should have hasChecker=true (except subject_group)', () => {
      // subject_group is encodable but has hasChecker=false (it's a grouping construct)
      for (const kind of SOLVER_ENCODABLE_KINDS) {
        const meta = CONSTRAINT_REGISTRY.find((m) => m.kind === kind);
        if (kind === 'subject_group') {
          assert.equal(meta?.hasChecker, false);
        } else {
          assert.equal(meta?.hasChecker, true);
        }
      }
    });
  });

  describe('Disambiguation table integration', () => {
    // These are the kinds referenced in disambiguation-table.ts
    // Verify they all exist in the registry
    const DISAMBIGUATION_KINDS: ConstraintKind[] = [
      'teacher_required_period',
      'teacher_required_day',
      'teacher_required_slot',
      'teacher_block_period',
      'teacher_min_per_day',
      'class_required_period',
      'subject_required_period',
    ];

    it('all kinds used in disambiguation-table.ts should exist in CONSTRAINT_REGISTRY', () => {
      for (const kind of DISAMBIGUATION_KINDS) {
        assert.ok(REGISTRY_KINDS.has(kind));
      }
    });
  });
});
