/**
 * constraint-spec-normalizer.ts
 *
 * Normalize/expand `ConstraintSpec[]` trước khi gửi sang solver hoặc
 * validator, để chặn các no-op do sentinel subject ("mọi môn" / `__all__`
 * / missing) hoặc max key không thống nhất (`max` vs `maxConsecutive`).
 *
 * Quy tắc:
 *  - "mọi môn" sentinels (`__all__`, `all`, `mọi môn`, `tất cả môn`, …)
 *    phải được expand thành nhiều spec subject cụ thể dựa trên
 *    assignments đầu vào.
 *  - `params.maxConsecutive ?? params.max` phải được chuẩn hóa, viết cả
 *    2 key ra spec output (giữ backward compat cho skeleton cũ).
 *  - Spec thiếu max hợp lệ → issues `invalid_max_consecutive` thay vì
 *    âm thầm bỏ qua.
 *  - Mở rộng cho các scope khác (`teacher`, `class`, `assignment`) sẽ
 *    đến sau; tập trung `subject_max_consecutive` trước vì là root cause
 *    của case 4 tiết Văn liên tiếp.
 */

import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';
import { normalizeConstraintText } from './translator-text';

const ALL_SUBJECT_SENTINELS_RAW = new Set<string>([
  '',
  '__all__',
  'all',
  'all_subjects',
  'all subjects',
  'mọi môn',
  'moi mon',
  'tất cả môn',
  'tat ca mon',
]);

export function isAllSubjectValue(value: unknown): boolean {
  const raw = String(value ?? '').trim();
  if (!raw) return true;
  if (ALL_SUBJECT_SENTINELS_RAW.has(raw)) return true;
  const normalized = normalizeConstraintText(raw);
  return ALL_SUBJECT_SENTINELS_RAW.has(normalized);
}

function uniqueSubjectsForScope(
  input: AgentInputPayload,
  classes?: string[]
): string[] {
  const classSet = Array.isArray(classes) && classes.length
    ? new Set(classes.map((value) => String(value)))
    : null;
  const subjects = new Set<string>();
  for (const assignment of input.assignments) {
    if (classSet && !classSet.has(assignment.class.label)) continue;
    subjects.add(assignment.subject.label);
  }
  return [...subjects].sort((a, b) => a.localeCompare(b, 'vi'));
}

function canonicalMax(params: Record<string, unknown>): number | null {
  const raw =
    params.maxConsecutive !== undefined && params.maxConsecutive !== null
      ? params.maxConsecutive
      : params.max;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return null;
  return Math.floor(value);
}

export type SpecNormalizationIssue = {
  code: string;
  constraintId?: string;
  message: string;
};

export type SpecNormalizationResult = {
  specs: ConstraintSpec[];
  issues: SpecNormalizationIssue[];
};

function normalizeSubjectMaxConsecutive(
  spec: ConstraintSpec,
  input: AgentInputPayload
): SpecNormalizationResult {
  const max = canonicalMax(spec.params);
  if (max === null) {
    return {
      specs: [],
      issues: [
        {
          code: 'invalid_max_consecutive',
          constraintId: spec.id,
          message: `Ràng buộc ${spec.id} thiếu maxConsecutive/max hợp lệ.`,
        },
      ],
    };
  }

  const classes = Array.isArray(spec.params.classes)
    ? spec.params.classes.map((value) => String(value)).filter(Boolean)
    : undefined;

  const rawSubject = spec.params.subject;
  const subjects = isAllSubjectValue(rawSubject)
    ? uniqueSubjectsForScope(input, classes)
    : [String(rawSubject ?? '').trim()].filter(Boolean);

  if (!subjects.length) {
    return {
      specs: [],
      issues: [
        {
          code: 'no_subject_targets',
          constraintId: spec.id,
          message: `Ràng buộc ${spec.id} không tìm được môn áp dụng.`,
        },
      ],
    };
  }

  const isExpansion = isAllSubjectValue(rawSubject);
  const normalized: ConstraintSpec[] = subjects.map((subjectLabel, index) => ({
    ...spec,
    id: subjects.length === 1 ? spec.id : `${spec.id}_${index + 1}`,
    params: {
      ...spec.params,
      subject: subjectLabel,
      maxConsecutive: max,
      max,
      ...(classes?.length ? { classes } : {}),
    },
    notes: [spec.notes, isExpansion ? `expanded_from_all_subject:${spec.id}` : '']
      .filter(Boolean)
      .join(';'),
  }));

  return { specs: normalized, issues: [] };
}

/**
 * Apply all known spec-level normalizations. Pass-through specs that don't
 * need transformation, with the exception of:
 *   - subject_max_consecutive: expand + canonicalize maxConsecutive.
 *   - other built-in kinds: also rewrite maxConsecutive ↔ max to keep
 *     readers consistent (so we don't get silent wrong key reads).
 */
export function normalizeConstraintSpecsForSolving(
  input: AgentInputPayload,
  specs: ConstraintSpec[]
): SpecNormalizationResult {
  const out: ConstraintSpec[] = [];
  const issues: SpecNormalizationIssue[] = [];

  for (const spec of specs) {
    if (spec.kind === 'subject_max_consecutive') {
      const result = normalizeSubjectMaxConsecutive(spec, input);
      out.push(...result.specs);
      issues.push(...result.issues);
      continue;
    }

    if (
      spec.kind === 'teacher_max_consecutive' ||
      spec.kind === 'class_max_consecutive'
    ) {
      const max = canonicalMax(spec.params);
      if (max === null) {
        issues.push({
          code: 'invalid_max_consecutive',
          constraintId: spec.id,
          message: `Ràng buộc ${spec.id} thiếu maxConsecutive/max hợp lệ.`,
        });
        continue;
      }
      out.push({
        ...spec,
        params: {
          ...spec.params,
          maxConsecutive: max,
          max,
        },
      });
      continue;
    }

    out.push(spec);
  }

  return { specs: out, issues };
}
