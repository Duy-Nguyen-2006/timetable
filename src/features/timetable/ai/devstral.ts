import type {
  ModelRequestPreview,
  CompilerResult,
  VerifierResult,
  AICompiledConstraint,
  AIUnparsedConstraint,
} from './types'
import { buildCompilerPrompts, buildVerifierPrompts } from './prompt'

const API_BASE_URL =
  process.env.LOWPRIZO_API_BASE_URL || 'https://api.lowprizo.com'

// ---------------------------------------------------------------------------
// Stage 1: AI Constraint Compiler
// ---------------------------------------------------------------------------

export async function compileConstraintsWithAI(
  preview: ModelRequestPreview,
  apiKey: string,
): Promise<CompilerResult> {
  if (!apiKey) {
    return { constraints: [], unparsed: [] }
  }

  const effectiveModel = preview.model || 'devstral-latest'

  try {
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
    }).catch(() => null)

    if (!response?.ok) {
      return _compilerFallback(preview, 'API request failed')
    }

    const data = await response.json().catch(() => null)
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      return _compilerFallback(preview, 'No content in response')
    }

    // Try to parse the JSON response
    const parsed = _safeParseJSON(text)
    if (!parsed) {
      return _compilerFallback(preview, 'Invalid JSON in AI response')
    }

    // Validate shape
    if (
      !Array.isArray(parsed.constraints) ||
      !Array.isArray(parsed.unparsed)
    ) {
      return _compilerFallback(preview, 'Invalid response shape')
    }

    // Validate and normalize each compiled constraint
    const constraints: AICompiledConstraint[] = parsed.constraints
      .filter(
        (c: any) =>
          c.id && c.original && c.priority && c.code,
      )
      .map((c: any) => ({
        id: String(c.id),
        description: String(c.description || ''),
        original: String(c.original),
        priority: c.priority === 'soft' ? 'soft' : 'hard',
        weight:
          c.priority === 'soft' ? (typeof c.weight === 'number' ? c.weight : 5) : undefined,
        code: String(c.code),
      }))

    const unparsed: AIUnparsedConstraint[] = (parsed.unparsed || [])
      .filter((u: any) => u.id && u.original)
      .map((u: any) => ({
        id: String(u.id),
        original: String(u.original),
        reason: String(u.reason || 'AI không thể biên dịch ràng buộc này.'),
      }))

    return { constraints, unparsed }
  } catch {
    return _compilerFallback(preview, 'Exception during compilation')
  }
}

function _compilerFallback(
  preview: ModelRequestPreview,
  _reason: string,
): CompilerResult {
  // Extract raw constraints from the user message to build unparsed list
  const userMsg = preview.messages.find((m) => m.role === 'user')?.content
  let rawConstraints: Array<{ id: string; text: string }> = []

  if (typeof userMsg === 'string') {
    try {
      const parsed = JSON.parse(userMsg)
      if (Array.isArray(parsed.rawConstraints)) {
        rawConstraints = parsed.rawConstraints
      }
    } catch {
      // ignore
    }
  }

  return {
    constraints: [],
    unparsed: rawConstraints.map((c) => ({
      id: c.id,
      original: c.text,
      reason: 'AI compile thất bại',
    })),
  }
}

// ---------------------------------------------------------------------------
// Stage 2: AI Solution Verifier
// ---------------------------------------------------------------------------

export async function verifySolutionWithAI(
  args: {
    rawConstraints: Array<{ id: string; text: string; priority: string }>
    cells: Array<{
      slotId: string
      dayId: string
      sessionId: string
      period: number
      entries: Array<{
        assignmentKey: string
        subject: string
        teacher: string
        className: string
      }>
    }>
    compiledConstraints: Array<{
      id: string
      description: string
      original: string
      priority: string
      code: string
    }>
    entities: {
      teachers: string[]
      subjects: string[]
      classes: string[]
    }
  },
  apiKey: string,
): Promise<VerifierResult> {
  if (!apiKey) {
    return {
      violations: [],
      overallAssessment: 'Verifier không khả dụng (không có API key).',
    }
  }

  try {
    const preview = buildVerifierPrompts(args)
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
    }).catch(() => null)

    if (!response?.ok) {
      return {
        violations: [],
        overallAssessment: 'Verifier không khả dụng.',
      }
    }

    const data = await response.json().catch(() => null)
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      return {
        violations: [],
        overallAssessment: 'Verifier không khả dụng.',
      }
    }

    const parsed = _safeParseJSON(text)
    if (!parsed || !Array.isArray(parsed.violations)) {
      return {
        violations: [],
        overallAssessment:
          parsed?.overallAssessment || 'Verifier trả kết quả không hợp lệ.',
      }
    }

    return {
      violations: parsed.violations
        .filter((v: any) => v.constraintId && typeof v.violated === 'boolean')
        .map((v: any) => ({
          constraintId: String(v.constraintId),
          original: String(v.original || ''),
          violated: Boolean(v.violated),
          reason: String(v.reason || ''),
          confidence: Number(v.confidence ?? 0),
        })),
      overallAssessment: String(
        parsed.overallAssessment || 'Kiểm tra hoàn tất.',
      ),
    }
  } catch {
    return {
      violations: [],
      overallAssessment: 'Verifier không khả dụng.',
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function _safeParseJSON(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1])
      } catch {
        return null
      }
    }
    return null
  }
}
