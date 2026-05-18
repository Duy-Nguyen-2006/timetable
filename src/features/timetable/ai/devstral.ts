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

// Timeout for AI API calls (ms)
const AI_API_TIMEOUT_MS = 15_000

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
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AI_API_TIMEOUT_MS)

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
      signal: controller.signal,
    }).catch((err) => {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError'
      console.warn('[compiler] fetch failed:', isTimeout ? 'timeout' : err)
      return null as Response | null
    })

    clearTimeout(timeoutId)

    if (!response?.ok) {
      const status = response?.status
      console.warn('[compiler] API request failed, status:', status)
      return _compilerFallback(preview, `API request failed (status: ${status ?? 'no response'})`)
    }

    const data = await response.json().catch((err) => {
      console.warn('[compiler] JSON parse failed:', err)
      return null
    })
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      console.warn('[compiler] No content in AI response')
      return _compilerFallback(preview, 'No content in response')
    }

    // Try to parse the JSON response
    const parsed = _safeParseJSON(text)
    if (!parsed) {
      console.warn('[compiler] Invalid JSON in AI response, raw length:', text.length)
      return _compilerFallback(preview, 'Invalid JSON in AI response')
    }

    // Validate shape
    if (
      !Array.isArray(parsed.constraints) ||
      !Array.isArray(parsed.unparsed)
    ) {
      console.warn('[compiler] Invalid response shape from AI')
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

    console.log('[compiler] success:', constraints.length, 'compiled,', unparsed.length, 'unparsed')
    return { constraints, unparsed }
  } catch (err) {
    console.warn('[compiler] Exception during compilation:', err)
    return _compilerFallback(preview, `Exception: ${err instanceof Error ? err.message : 'unknown'}`)
  }
}

function _compilerFallback(
  preview: ModelRequestPreview,
  reason: string,
): CompilerResult {
  console.warn('[compiler fallback]', reason)

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

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AI_API_TIMEOUT_MS)

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
      signal: controller.signal,
    }).catch((err) => {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError'
      console.warn('[verifier] fetch failed:', isTimeout ? 'timeout' : err)
      return null as Response | null
    })

    clearTimeout(timeoutId)

    if (!response?.ok) {
      const status = response?.status
      console.warn('[verifier] API request failed, status:', status)
      return {
        violations: [],
        overallAssessment: 'Verifier không khả dụng.',
      }
    }

    const data = await response.json().catch((err) => {
      console.warn('[verifier] JSON parse failed:', err)
      return null
    })
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      console.warn('[verifier] No content in AI response')
      return {
        violations: [],
        overallAssessment: 'Verifier không khả dụng.',
      }
    }

    const parsed = _safeParseJSON(text)
    if (!parsed || !Array.isArray(parsed.violations)) {
      console.warn('[verifier] Invalid response from AI')
      return {
        violations: [],
        overallAssessment:
          parsed?.overallAssessment || 'Verifier trả kết quả không hợp lệ.',
      }
    }

    const violations = parsed.violations
      .filter((v: any) => v.constraintId && typeof v.violated === 'boolean')
      .map((v: any) => ({
        constraintId: String(v.constraintId),
        original: String(v.original || ''),
        violated: Boolean(v.violated),
        reason: String(v.reason || ''),
        confidence: Number(v.confidence ?? 0),
      }))

    const overallAssessment = String(parsed.overallAssessment || 'Kiểm tra hoàn tất.')
    console.log('[verifier] success:', violations.filter(v => v.violated).length, 'violations found')

    return { violations, overallAssessment }
  } catch (err) {
    console.warn('[verifier] Exception:', err)
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
