import type { ModelRequestPreview, NormalizedConstraintResult } from './types'

const API_BASE_URL = process.env.LOWPRIZO_API_BASE_URL || 'https://api.lowprizo.com'

function fallbackNormalize(preview: ModelRequestPreview): NormalizedConstraintResult {
  const content = preview.messages.find((message) => message.role === 'user')?.content
  const rawConstraints = typeof content === 'object' && content && 'constraints' in content
    ? ((content as { constraints?: Array<{ id: string; priority: string; text: string }> }).constraints ?? [])
    : []

  const slots = typeof content === 'object' && content && 'slots' in content
    ? ((content as { slots?: Array<{ slotId: string; dayLabel: string; sessionLabel: string; period: number }> }).slots ?? [])
    : []

  const teachers = typeof content === 'object' && content && 'teachers' in content
    ? ((content as { teachers?: string[] }).teachers ?? [])
    : []

  const subjects = typeof content === 'object' && content && 'subjects' in content
    ? ((content as { subjects?: string[] }).subjects ?? [])
    : []

  const hard = [] as NormalizedConstraintResult['hard']
  const soft = [] as NormalizedConstraintResult['soft']
  const unparsed = [] as NormalizedConstraintResult['unparsed']

  for (const constraint of rawConstraints) {
    const matchedTeacher = teachers.find((teacher) => constraint.text.includes(teacher))
    const matchedSubject = subjects.find((subject) => constraint.text.includes(subject))
    const matchedMorning = /buổi sáng|sáng/i.test(constraint.text)
    const matchedSlot = slots.find((slot) => {
      const periodMatch = new RegExp(`tiết\\s*${slot.period}`, 'i').test(constraint.text)
      const dayMatch = constraint.text.includes(slot.dayLabel) || constraint.text.includes(slot.dayLabel.replace('Thứ ', 'thứ '))
      const sessionMatch = constraint.text.includes(slot.sessionLabel) || (matchedMorning && slot.sessionLabel === 'Sáng')
      return periodMatch && dayMatch && sessionMatch
    })

    if (constraint.priority === 'required' && matchedTeacher && matchedSlot && /không dạy|không học|nghỉ/i.test(constraint.text)) {
      hard.push({
        sourceConstraintId: constraint.id,
        type: 'teacher_unavailable',
        teacherId: matchedTeacher,
        slotIds: [matchedSlot.slotId],
        confidence: 0.6,
      })
      continue
    }

    if (constraint.priority === 'preferred' && matchedSubject && matchedMorning) {
      soft.push({
        sourceConstraintId: constraint.id,
        type: 'prefer_subject_session',
        subjectId: matchedSubject,
        sessionIds: ['morning'],
        weight: 5,
        confidence: 0.55,
      })
      continue
    }

    unparsed.push({
      sourceConstraintId: constraint.id,
      text: constraint.text,
      reason: 'Fallback parser chưa hiểu chắc chắn ràng buộc này.',
    })
  }

  return { hard, soft, unparsed }
}

export async function normalizeConstraintsWithDevstral(
  preview: ModelRequestPreview,
  apiKey: string,
): Promise<NormalizedConstraintResult> {
  if (!apiKey) {
    return fallbackNormalize(preview)
  }

  const effectiveModel = preview.model || 'devstral-latest'

  const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      ...preview,
      model: effectiveModel,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    return fallbackNormalize(preview)
  }

  const data = await response.json().catch(() => null)
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string') {
    return fallbackNormalize(preview)
  }

  try {
    const parsed = JSON.parse(text)
    if (!parsed || !Array.isArray(parsed.hard) || !Array.isArray(parsed.soft) || !Array.isArray(parsed.unparsed)) {
      return fallbackNormalize(preview)
    }
    return parsed as NormalizedConstraintResult
  } catch {
    return fallbackNormalize(preview)
  }
}
