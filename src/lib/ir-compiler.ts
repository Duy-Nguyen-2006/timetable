import type { IRRule } from '@/features/timetable/ai/ir'

type CompiledConstraint = {
  id: string
  original: string
  description: string
  priority: 'hard' | 'soft'
  weight?: number
  code: string
  checkerCode?: string
}

export function compileIRToConstraints(rules: IRRule[]): CompiledConstraint[] {
  return rules.map((rule) => ({
    id: rule.id,
    original: rule.original,
    description: rule.description,
    priority: rule.priority,
    weight: rule.weight,
    code: '# IR compiler scaffold: fallback no-op constraint',
    checkerCode: 'result = (True, "")',
  }))
}
