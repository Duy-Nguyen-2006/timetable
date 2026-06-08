import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWizardValuesFromPrefill } from './constraint-wizard-prefill';

test('buildWizardValuesFromPrefill maps teacher day suggestion into form values', () => {
  const result = buildWizardValuesFromPrefill({
    templateId: 'teacher_block_day',
    paramsDraft: { teacher: 'Sơn', day: 'monday' },
  }, 'required');

  assert.equal(result?.group, 'teacher');
  assert.equal(result?.values.templateId, 'teacher_block_day');
  assert.equal(result?.values.teacher, 'Sơn');
  assert.equal(result?.values.day, 'monday');
});

test('buildWizardValuesFromPrefill maps numeric max params without changing defaults', () => {
  const result = buildWizardValuesFromPrefill({
    templateId: 'teacher_max_per_day',
    paramsDraft: { teacher: 'Sơn', maxPerDay: 4 },
  }, 'preferred');

  assert.equal(result?.values.severity, 'soft');
  assert.equal(result?.values.teacher, 'Sơn');
  assert.equal(result?.values.maxPerDay, 4);
  assert.equal(result?.values.weight, 5);
});

test('buildWizardValuesFromPrefill maps allowed day arrays', () => {
  const result = buildWizardValuesFromPrefill({
    templateId: 'teacher_allowed_days',
    paramsDraft: { teacher: 'Sơn', days: ['monday', 'wednesday'] },
  }, 'required');

  assert.deepEqual(result?.values.days, ['monday', 'wednesday']);
});
