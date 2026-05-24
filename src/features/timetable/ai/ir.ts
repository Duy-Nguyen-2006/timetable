export type IRAtom = {
  entityType: 'teacher' | 'class' | 'subject'
  entityName: string
  dayId?: string
  sessionId?: string
  period?: number
  scope?: 'single_slot' | 'day' | 'week'
  negated?: boolean
}

export type IRRule = {
  id: string
  original: string
  description: string
  when: IRAtom[]
  then: IRAtom[]
  priority: 'hard' | 'soft'
  weight?: number
}

export type IRDraft = {
  rules: IRRule[]
  warnings: string[]
}

export type IRReviewResult = {
  rules: IRRule[]
  warnings: string[]
  confidence: number
}

export function buildIRDraftFromConstraints(constraints: Array<{ id: string; text: string; type: 'required' | 'preferred' }>): IRDraft {
  return {
    rules: constraints.map((c) => ({
      id: c.id,
      original: c.text,
      description: c.text,
      when: [],
      then: [],
      priority: c.type === 'required' ? 'hard' : 'soft',
      weight: c.type === 'preferred' ? 5 : undefined,
    })),
    warnings: ['IR draft parser is currently scaffold-only and requires model refinement.'],
  }
}

export function reviewIRDraft(draft: IRDraft): IRReviewResult {
  return {
    rules: draft.rules,
    warnings: draft.warnings,
    confidence: 0.5,
  }
}
