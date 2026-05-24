import assert from 'node:assert/strict'
import test from 'node:test'

function preprocessInputPayload(payload) {
  const warnings = []
  const fatalErrors = []

  const normalizeText = (value) => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  const pushIndex = (map, key, value) => {
    if (!map[key]) map[key] = []
    map[key].push(value)
  }

  const seenSlotIds = new Set()
  const seenSlotCoords = new Set()
  const normalizedSlots = []

  for (const slot of payload.slots) {
    const id = normalizeText(slot.id)
    const dayId = normalizeText(slot.dayId)
    const dayLabel = normalizeText(slot.dayLabel)
    const sessionId = normalizeText(slot.sessionId)
    const sessionLabel = normalizeText(slot.sessionLabel)
    const period = Number(slot.period)

    if (!id) fatalErrors.push('Có slot bị thiếu id.')
    if (!dayId) fatalErrors.push(`Slot ${id || '(không rõ id)'} bị thiếu dayId.`)
    if (!sessionId) fatalErrors.push(`Slot ${id || '(không rõ id)'} bị thiếu sessionId.`)
    if (!dayLabel) fatalErrors.push(`Slot ${id || '(không rõ id)'} bị thiếu dayLabel.`)
    if (!sessionLabel) fatalErrors.push(`Slot ${id || '(không rõ id)'} bị thiếu sessionLabel.`)
    if (!Number.isInteger(period) || period <= 0) fatalErrors.push(`Slot ${id || '(không rõ id)'} có period không hợp lệ.`)

    if (id) {
      if (seenSlotIds.has(id)) fatalErrors.push(`Trùng slot id: ${id}`)
      seenSlotIds.add(id)
    }

    const coordKey = `${dayId}__${sessionId}__${period}`
    if (dayId && sessionId && Number.isInteger(period) && period > 0) {
      if (seenSlotCoords.has(coordKey)) fatalErrors.push(`Trùng slot theo tọa độ: ${coordKey}`)
      seenSlotCoords.add(coordKey)
    }

    normalizedSlots.push({ id, dayId, dayLabel, sessionId, sessionLabel, period })
  }

  const seenAssignmentIds = new Set()
  const normalizedAssignments = []
  for (const assignment of payload.assignments) {
    const id = normalizeText(assignment.id)
    const teacherId = normalizeText(assignment.teacherId)
    const teacherLabel = normalizeText(assignment.teacherLabel)
    const classId = normalizeText(assignment.classId)
    const classLabel = normalizeText(assignment.classLabel)
    const subjectId = normalizeText(assignment.subjectId)
    const subjectLabel = normalizeText(assignment.subjectLabel)
    const weeklyPeriods = Number(assignment.weeklyPeriods)

    if (!id) fatalErrors.push('Có assignment bị thiếu id.')
    if (!teacherId) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu teacherId.`)
    if (!teacherLabel) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu teacherLabel.`)
    if (!classId) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu classId.`)
    if (!classLabel) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu classLabel.`)
    if (!subjectId) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu subjectId.`)
    if (!subjectLabel) fatalErrors.push(`Assignment ${id || '(không rõ id)'} bị thiếu subjectLabel.`)
    if (!Number.isInteger(weeklyPeriods) || weeklyPeriods <= 0) fatalErrors.push(`Assignment ${id || '(không rõ id)'} có weeklyPeriods không hợp lệ.`)

    if (id) {
      if (seenAssignmentIds.has(id)) fatalErrors.push(`Trùng assignment id: ${id}`)
      seenAssignmentIds.add(id)
    }

    normalizedAssignments.push({ id, teacherId, teacherLabel, classId, classLabel, subjectId, subjectLabel, weeklyPeriods })
  }

  if (normalizedSlots.length === 0) fatalErrors.push('Không có slot khả dụng.')
  if (normalizedAssignments.length === 0) fatalErrors.push('Không có phân công để xếp.')

  if (fatalErrors.length > 0) {
    return {
      ok: false,
      fatalErrors,
      warnings,
      diagnostics: ['Preprocess phát hiện dữ liệu đầu vào không hợp lệ về mặt cấu trúc.'],
    }
  }

  const teacherToAssignments = {}
  const classToAssignments = {}
  const subjectToAssignments = {}

  for (const assignment of normalizedAssignments) {
    pushIndex(teacherToAssignments, assignment.teacherId, assignment.id)
    pushIndex(classToAssignments, assignment.classId, assignment.id)
    pushIndex(subjectToAssignments, assignment.subjectId, assignment.id)
  }

  return {
    ok: true,
    normalizedPayload: {
      slots: normalizedSlots,
      assignments: normalizedAssignments,
      hardConstraints: payload.hardConstraints,
      softConstraints: payload.softConstraints,
    },
    warnings,
    diagnostics: ['Preprocess chỉ kiểm tra cấu trúc dữ liệu đầu vào và chuẩn hóa payload.'],
    stats: {
      slotCount: normalizedSlots.length,
      assignmentCount: normalizedAssignments.length,
      teacherCount: Object.keys(teacherToAssignments).length,
      classCount: Object.keys(classToAssignments).length,
      subjectCount: Object.keys(subjectToAssignments).length,
    },
  }
}

function buildPayload(overrides = {}) {
  return {
    slots: [
      { id: 'monday-morning-1', dayId: 'monday', dayLabel: 'Thứ 2', sessionId: 'morning', sessionLabel: 'Sáng', period: 1 },
      { id: 'monday-morning-2', dayId: 'monday', dayLabel: 'Thứ 2', sessionId: 'morning', sessionLabel: 'Sáng', period: 2 },
    ],
    assignments: [
      {
        id: 'asg_1',
        teacherId: 'T1',
        teacherLabel: ' Sơn ',
        classId: 'C1',
        classLabel: ' 6A ',
        subjectId: 'S1',
        subjectLabel: ' Toán ',
        weeklyPeriods: 2,
      },
    ],
    hardConstraints: [{ id: 'hc_1', text: 'Sơn không dạy thứ 2' }],
    softConstraints: [{ id: 'sc_1', text: 'Toán nên xếp tiết 1', weight: 5 }],
    ...overrides,
  }
}

test('preprocessInputPayload normalizes valid payload', () => {
  const result = preprocessInputPayload(buildPayload())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.normalizedPayload.assignments[0].teacherLabel, 'Sơn')
  assert.equal(result.normalizedPayload.assignments[0].classLabel, '6A')
  assert.equal(result.stats.slotCount, 2)
  assert.equal(result.stats.assignmentCount, 1)
})

test('preprocessInputPayload rejects duplicate slot ids', () => {
  const result = preprocessInputPayload(buildPayload({
    slots: [
      { id: 'dup', dayId: 'monday', dayLabel: 'Thứ 2', sessionId: 'morning', sessionLabel: 'Sáng', period: 1 },
      { id: 'dup', dayId: 'monday', dayLabel: 'Thứ 2', sessionId: 'morning', sessionLabel: 'Sáng', period: 2 },
    ],
  }))
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.fatalErrors.join('\n'), /Trùng slot id/)
})

test('preprocessInputPayload rejects invalid weeklyPeriods', () => {
  const result = preprocessInputPayload(buildPayload({
    assignments: [
      {
        id: 'asg_1',
        teacherId: 'T1',
        teacherLabel: 'Sơn',
        classId: 'C1',
        classLabel: '6A',
        subjectId: 'S1',
        subjectLabel: 'Toán',
        weeklyPeriods: 0,
      },
    ],
  }))
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.fatalErrors.join('\n'), /weeklyPeriods không hợp lệ/)
})
