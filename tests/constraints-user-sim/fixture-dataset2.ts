// Fixture + loader for constraints_dataset_2.txt (300 unique constraints)

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AgentInputPayload } from '../../src/features/timetable/ai/types';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

export const teacherNames = [
  'Hiếu', 'Long', 'Dung', 'Mai', 'Tuấn', 'Lan', 'Hoa', 'Minh', 'Quân', 'Nam',
  'Phương', 'Trang', 'Bình', 'Cường', 'Đạt', 'Khánh', 'Thảo', 'Nhung', 'Toàn', 'Vân',
];

export const classNames = ['6A', '6B', '7A', '7B', '8A', '8B', '9A', '9B', '10A', '10B'];

/** Subjects referenced in constraints_dataset_2 (incl. aliases). */
export const subjectNames = [
  'Toán', 'Văn', 'Anh', 'Anh Văn', 'Lý', 'Hóa', 'Sinh', 'Sinh học', 'Sử', 'Lịch sử',
  'Địa', 'Địa lý', 'GDCD', 'Thể dục', 'Tin học', 'Công nghệ', 'Âm nhạc', 'Mỹ thuật',
];

const days = [
  { id: 'monday', label: 'Thứ 2' },
  { id: 'tuesday', label: 'Thứ 3' },
  { id: 'wednesday', label: 'Thứ 4' },
  { id: 'thursday', label: 'Thứ 5' },
  { id: 'friday', label: 'Thứ 6' },
];

const sessions = [
  { id: 'morning', label: 'Sáng' },
  { id: 'afternoon', label: 'Chiều' },
];

function buildAssignments() {
  const assignments: AgentInputPayload['assignments'] = [];
  let asgId = 0;
  for (let t = 0; t < teacherNames.length; t++) {
    for (let c = 0; c < 2; c++) {
      for (let s = 0; s < 2; s++) {
        assignments.push({
          id: `asg_${asgId++}`,
          teacher: { id: `t${t}`, label: teacherNames[t] },
          subject: { id: `s${s % subjectNames.length}`, label: subjectNames[s % subjectNames.length] },
          class: { id: `c${c}`, label: classNames[c] },
          weeklyPeriods: 3,
        });
      }
    }
  }
  return assignments;
}

export const dataset2Fixture: AgentInputPayload = {
  days,
  sessions,
  periodCounts: { monday: 6, tuesday: 6, wednesday: 6, thursday: 6, friday: 6 },
  deletedPeriods: {},
  assignments: buildAssignments(),
  constraints: [],
};

export function loadDataset2Constraints(): string[] {
  const raw = readFileSync(resolve(repoRoot, 'constraints_dataset_2.txt'), 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('"'));
  return [...new Set(lines)];
}

export function ruleParseContextFromFixture(input: AgentInputPayload) {
  const uniq = (values: string[]) => Array.from(new Set(values)).filter(Boolean);
  return {
    teachers: uniq(input.assignments.map((a) => a.teacher.label)),
    subjects: uniq(input.assignments.map((a) => a.subject.label)),
    classes: uniq(input.assignments.map((a) => a.class.label)),
  };
}
