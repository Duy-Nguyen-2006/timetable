import assert from 'node:assert/strict'
import test from 'node:test'

import { QUICK_IMPORT_SAMPLE_TEXT, parseQuickImportText } from './quick-import'

test('parseQuickImportText parses full dataset and keeps expected values', () => {
  const parsed = parseQuickImportText(QUICK_IMPORT_SAMPLE_TEXT)

  assert.deepEqual(parsed.selectedDays, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
  assert.deepEqual(parsed.selectedSessions, ['morning'])
  assert.equal(parsed.periods.morning, 4)
  assert.equal(parsed.teachers.length, 8)
  assert.equal(parsed.subjects.length, 8)
  assert.deepEqual(parsed.classes, ['6A', '6B'])
  assert.equal(parsed.assignments.length, 16)
  assert.equal(parsed.hardConstraints[0], 'Sơn không dạy thứ 2')
  assert.equal(parsed.softConstraints[1], 'Văn nên liên tiếp 2 tiết')
})

test('parseQuickImportText accepts morning-afternoon and splits seven periods as 4 plus 3', () => {
  const parsed = parseQuickImportText(`DATASET 6
Days: Mon-Fri
Time: Morning-Afternoon
Max periods: 7
Teachers:
Sơn
Dung
Subjects:
Toán
Văn
Classes:
6A
Assignments:
Sơn-Toán-6A-5
Dung-Văn-6A-2
Hard constraints:
Toán buổi sáng
Soft constraints:
Không xếp Toán tiết 7`)

  assert.deepEqual(parsed.selectedSessions, ['morning', 'afternoon'])
  assert.equal(parsed.periods.morning, 4)
  assert.equal(parsed.periods.afternoon, 3)
  assert.equal(parsed.assignments.length, 2)
  assert.equal(parsed.hardConstraints[0], 'Toán buổi sáng')
})

test('parseQuickImportText throws on malformed assignment period', () => {
  const invalid = `Days: Mon-Fri
Time: Morning
Max periods: 4
Teachers:
A
Subjects:
Toán
Classes:
6A
Assignments:
A-Toán-6A-X`

  assert.throws(() => parseQuickImportText(invalid), /Số tiết không hợp lệ/)
})
