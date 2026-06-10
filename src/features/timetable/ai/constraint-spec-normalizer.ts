import type { AgentInputPayload } from './types';
import type { ConstraintSpec } from './constraint-spec';
import type { ConstraintParseIssue } from './constraint-review-types';

export type ConstraintSpecNormalizerResult = {
  specs: ConstraintSpec[];
  issues: ConstraintParseIssue[];
};

function issue(message: string, field?: string): ConstraintParseIssue {
  return {
    code: 'missing_required_param',
    message,
    ...(field ? { field } : {}),
  };
}

function uniqueLabels(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function knownSubjects(input: AgentInputPayload): string[] {
  return uniqueLabels(input.assignments.map((assignment) => assignment.subject.label));
}

function cloneSpec(spec: ConstraintSpec, patch: Partial<ConstraintSpec> = {}): ConstraintSpec {
  return {
    ...spec,
    params: { ...(spec.params ?? {}) },
    ...patch,
  };
}

function asFinitePositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.trunc(n);
}

function normalizeRequiredPeriodSpec(spec: ConstraintSpec): ConstraintSpecNormalizerResult {
  const params = { ...(spec.params ?? {}) };
  const period = asFinitePositiveInt(params.period);
  const minCount = asFinitePositiveInt(params.minCount ?? params.count ?? 1);

  const issues: ConstraintParseIssue[] = [];
  if (period === null) {
    issues.push(issue(`Ràng buộc ${spec.kind} thiếu tiết hợp lệ.`, 'period'));
  }
  if (minCount === null) {
    issues.push(issue(`Ràng buộc ${spec.kind} thiếu số lượng tối thiểu hợp lệ.`, 'minCount'));
  }

  if (spec.kind === 'teacher_required_period' && !String(params.teacher ?? '').trim()) {
    issues.push(issue('Ràng buộc giáo viên phải có tiết N thiếu tên giáo viên.', 'teacher'));
  }
  if (spec.kind === 'class_required_period' && !String(params.class ?? '').trim()) {
    issues.push(issue('Ràng buộc lớp phải có tiết N thiếu tên lớp.', 'class'));
  }
  if (spec.kind === 'subject_required_period' && !String(params.subject ?? '').trim()) {
    issues.push(issue('Ràng buộc môn phải có tiết N thiếu tên môn.', 'subject'));
  }

  if (issues.length > 0) return { specs: [], issues };

  return {
    specs: [
      cloneSpec(spec, {
        params: {
          ...params,
          period,
          minCount,
        },
      }),
    ],
    issues: [],
  };
}

function normalizeSubjectMaxConsecutive(
  input: AgentInputPayload,
  spec: ConstraintSpec
): ConstraintSpecNormalizerResult {
  const params = { ...(spec.params ?? {}) };
  const rawSubject = String(params.subject ?? '').trim();
  const maxConsecutive = asFinitePositiveInt(params.maxConsecutive ?? params.max ?? 1);

  if (maxConsecutive === null) {
    return {
      specs: [],
      issues: [issue('Ràng buộc môn học liên tiếp thiếu số tiết tối đa hợp lệ.', 'maxConsecutive')],
    };
  }

  const normalizedParams = { ...params, maxConsecutive };

  if (rawSubject && rawSubject !== '__all__') {
    return {
      specs: [cloneSpec(spec, { params: { ...normalizedParams, subject: rawSubject } })],
      issues: [],
    };
  }

  const subjects = knownSubjects(input);
  if (subjects.length === 0) {
    return {
      specs: [],
      issues: [issue('Không tìm thấy môn học nào để áp dụng ràng buộc cho tất cả môn.', 'subject')],
    };
  }

  return {
    specs: subjects.map((subject, index) =>
      cloneSpec(spec, {
        id: `${spec.id}_${index + 1}`,
        params: {
          ...normalizedParams,
          subject,
        },
      })
    ),
    issues: [],
  };
}

function normalizeSubjectBlockPeriod(spec: ConstraintSpec): ConstraintSpecNormalizerResult {
  const params = { ...(spec.params ?? {}) };
  const rawSubject = String(params.subject ?? '').trim();
  const periods = Array.isArray(params.periods)
    ? params.periods.map(asFinitePositiveInt).filter((p): p is number => p !== null)
    : params.period !== undefined
      ? [asFinitePositiveInt(params.period)].filter((p): p is number => p !== null)
      : [];

  const issues: ConstraintParseIssue[] = [];
  if (!rawSubject || rawSubject === '__all__') {
    issues.push(issue('Ràng buộc cấm tiết của môn học thiếu tên môn cụ thể.', 'subject'));
  }
  if (periods.length === 0) {
    issues.push(issue('Ràng buộc cấm tiết của môn học thiếu danh sách tiết hợp lệ.', 'periods'));
  }

  if (issues.length > 0) return { specs: [], issues };

  return {
    specs: [cloneSpec(spec, { params: { ...params, subject: rawSubject, periods } })],
    issues: [],
  };
}

/**
 * Final normalization before solve.
 *
 * This is intentionally deterministic and fail-closed. It only rewrites
 * shapes whose semantics are unambiguous; malformed confirmed specs are
 * returned as issues so the solve gate can stop before CP-SAT.
 */
export function normalizeConstraintSpecsForSolving(
  input: AgentInputPayload,
  specs: readonly ConstraintSpec[]
): ConstraintSpecNormalizerResult {
  const normalizedSpecs: ConstraintSpec[] = [];
  const issues: ConstraintParseIssue[] = [];

  for (const spec of specs) {
    if (
      spec.kind === 'teacher_required_period' ||
      spec.kind === 'class_required_period' ||
      spec.kind === 'subject_required_period'
    ) {
      const result = normalizeRequiredPeriodSpec(spec);
      normalizedSpecs.push(...result.specs);
      issues.push(...result.issues);
      continue;
    }

    if (spec.kind === 'subject_max_consecutive') {
      const result = normalizeSubjectMaxConsecutive(input, spec);
      normalizedSpecs.push(...result.specs);
      issues.push(...result.issues);
      continue;
    }

    if (spec.kind === 'subject_block_period') {
      const result = normalizeSubjectBlockPeriod(spec);
      normalizedSpecs.push(...result.specs);
      issues.push(...result.issues);
      continue;
    }

    normalizedSpecs.push(cloneSpec(spec));
  }

  return { specs: normalizedSpecs, issues };
}
