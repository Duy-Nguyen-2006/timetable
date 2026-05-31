import { Fragment } from 'react'
import { makeAssignmentKey } from './utils'
import type { AssignmentItem, BulkAssignmentError } from './types'

export const parseLines = (input: string) =>
  input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

export function parseBulkAssignments(
  text: string,
  teacherList: string[],
  subjectList: string[],
  classList: string[],
): { parsed: AssignmentItem[]; errors: BulkAssignmentError[] } {
  const parsed: AssignmentItem[] = []
  const errors: BulkAssignmentError[] = []

  text.split(/\r?\n/).forEach((rawLine, index) => {
    if (!rawLine.trim()) return

    const parts = rawLine.split('-').map((part) => part.trim())
    if (parts.length !== 4) {
      errors.push({ line: index + 1, rawLine, segmentIndex: -1 })
      return
    }

    const [teacher, subject, className, weeklyPeriods] = parts
    const normalizedClassName = className.toUpperCase()
    const checks = [
      { value: teacher, valid: Boolean(teacher) && teacherList.includes(teacher) },
      { value: subject, valid: Boolean(subject) && subjectList.includes(subject) },
      { value: className, valid: Boolean(className) && classList.includes(normalizedClassName) },
      { value: weeklyPeriods, valid: /^\d+$/.test(weeklyPeriods) && Number(weeklyPeriods) > 0 },
    ]
    const badIndex = checks.findIndex((check) => !check.valid)
    if (badIndex !== -1) {
      errors.push({ line: index + 1, rawLine, parts, segmentIndex: badIndex })
      return
    }

    parsed.push({
      key: makeAssignmentKey(teacher, subject, normalizedClassName, weeklyPeriods),
      teacher,
      subject,
      className: normalizedClassName,
      weeklyPeriods,
    })
  })

  return { parsed, errors }
}

export const getBulkAssignmentErrorMessage = (error: BulkAssignmentError) => {
  if (!error.parts || error.segmentIndex === -1) return 'Sai format. Đúng: Teacher-Subject-Class-Number.'

  const value = error.parts[error.segmentIndex]?.trim() || 'trống'
  if (error.segmentIndex === 0) return `Giáo viên ${value} không được nhập ở bước trước, vui lòng nhập lại.`
  if (error.segmentIndex === 1) return `Môn ${value} không được nhập ở bước trước, vui lòng nhập lại.`
  if (error.segmentIndex === 2) return `Lớp ${value} không được nhập ở bước trước, vui lòng nhập lại.`
  return `Số tiết ${value} không hợp lệ, vui lòng nhập số nguyên lớn hơn 0.`
}

export const renderBulkAssignmentErrorLine = (error: BulkAssignmentError) => {
  if (!error.parts || error.segmentIndex === -1) {
    return <span className="text-red-300 underline decoration-red-400 decoration-2 underline-offset-2">{error.rawLine}</span>
  }

  return error.parts.map((part, index) => (
    <Fragment key={`${error.line}-${index}`}>
      {index > 0 ? <span className="text-white/30">-</span> : null}
      <span className={index === error.segmentIndex ? 'text-red-300 underline decoration-red-400 decoration-2 underline-offset-2' : 'text-white/60'}>
        {part || 'trống'}
      </span>
    </Fragment>
  ))
}
