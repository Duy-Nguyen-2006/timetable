import {
  CONSTRAINT_TEMPLATES,
  defaultFormValues,
  type ConstraintFormTemplateId,
  type ConstraintFormValues,
  type ConstraintTemplateMeta,
} from './constraint-form-schema';

export type ConstraintWizardPrefill = {
  templateId: ConstraintFormTemplateId;
  paramsDraft: Record<string, unknown>;
};

function stringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberParam(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArrayParam(params: Record<string, unknown>, key: string): string[] | undefined {
  const value = params[key];
  return Array.isArray(value) ? value.map(String).filter(Boolean) : undefined;
}

export function buildWizardValuesFromPrefill(
  prefill: ConstraintWizardPrefill,
  constraintType: 'required' | 'preferred'
): { group: ConstraintTemplateMeta['group']; values: ConstraintFormValues } | null {
  const template = CONSTRAINT_TEMPLATES.find((item) => item.id === prefill.templateId);
  if (!template) return null;
  const params = prefill.paramsDraft;
  const values: ConstraintFormValues = {
    ...defaultFormValues(prefill.templateId, constraintType),
    extraParams: params,
  };

  values.teacher = stringParam(params, 'teacher');
  values.subject = stringParam(params, 'subject');
  values.className = stringParam(params, 'class');
  values.day = stringParam(params, 'day');
  values.session = stringParam(params, 'session');
  values.assignmentId = stringParam(params, 'assignmentId');
  values.period = numberParam(params, 'period');
  values.maxPerDay = numberParam(params, 'maxPerDay');
  values.maxPeriods = numberParam(params, 'maxPeriods');
  values.max = numberParam(params, 'max');
  values.min = numberParam(params, 'min');
  values.days = stringArrayParam(params, 'days');
  values.periods = Array.isArray(params.periods)
    ? params.periods.map(Number).filter((value) => Number.isFinite(value))
    : undefined;
  values.assignmentIds = stringArrayParam(params, 'assignmentIds');

  return { group: template.group, values };
}
