import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import type { ConstraintSpec, ScheduleEntry } from './constraint-spec';
import { validateSchedule } from './deterministic-validator';

type Fixture = {
  name: string;
  schedule: ScheduleEntry[];
  constraints: Array<Omit<ConstraintSpec, 'original'> & { original?: string }>;
  expectedViolationIds: string[];
};

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../tests/fixtures/validator');
const compareText = (a: string, b: string) => a.localeCompare(b);

const fixtureFiles = readdirSync(fixturesDir).filter((file) => file.endsWith('.json'));

for (const file of fixtureFiles) {
  const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8')) as Fixture;

  test(`validator fixture (TS): ${fixture.name}`, () => {
    const specs: ConstraintSpec[] = fixture.constraints.map((constraint) => ({
      ...constraint,
      original: constraint.original ?? constraint.id,
    }));

    const report = validateSchedule(fixture.schedule, specs);
    const violationIds = [...new Set(report.violations.map((violation) => violation.constraintId))].sort(compareText);

    assert.deepEqual(violationIds, [...fixture.expectedViolationIds].sort(compareText));
  });
}
