const ALLOWED_NAMES = new Set([
  'model', 'slots', 'data', 'assignments', 'days', 'periods',
  'periods_by_day', 'constraints', 'custom_specs', 'schedule',
  'len', 'range', 'int', 'str', 'set', 'list', 'dict', 'tuple',
  'frozenset', 'sum', 'min', 'max', 'sorted', 'reversed', 'round',
  'divmod', 'zip', 'map', 'filter', 'enumerate', 'isinstance',
  'bool', 'float', 'abs', 'all', 'any', 'ValueError', 'NotImplementedError',
  'True', 'False', 'None',
]);

const LEAKED_SCHEMA_FIELDS = /\b(covered_constraint_ids|plan_summary|assumptions)\s*=/;
const IMPORT_STATEMENT = /^\s*(import\s+\w|from\s+\w+\s+import)/m;
const INFINITE_LOOP = /\bwhile\s+True\s*:/;
const BREAK_STATEMENT = /\bbreak\b/;
const WRONG_METHOD = /\bmodel\.(add|new_bool_var|new_int_var)\s*\(/;

export function staticValidateCode(code: string): string[] {
  const errors: string[] = [];

  if (LEAKED_SCHEMA_FIELDS.test(code)) {
    errors.push('Schema field leak: covered_constraint_ids/plan_summary/assumptions used as variable');
  }

  if (IMPORT_STATEMENT.test(code)) {
    errors.push('Import statements are forbidden in sandbox code');
  }

  if (INFINITE_LOOP.test(code) && !BREAK_STATEMENT.test(code)) {
    errors.push('Potential infinite loop: while True without break');
  }

  if (WRONG_METHOD.test(code)) {
    const match = code.match(WRONG_METHOD);
    errors.push(`Wrong method casing: model.${match?.[1]} should be model.${capitalize(match?.[1] ?? '')}`);
  }

  return errors;
}

function capitalize(s: string): string {
  if (!s) return s;
  const parts = s.split('_');
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}
