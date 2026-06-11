/**
 * Semantic verification for parsed constraint specs.
 * Lexical verify is always available; LLM verify is optional (1 extra call).
 */

import { z } from 'zod';

import type { AIProviderConfig } from './types';
import type { ConstraintSpec } from './constraint-spec';
import { humanizeConstraintSpec } from './constraint-humanizer';
import { backTranslateBatch, BACK_TRANSLATION_GATE } from './back-translation-check';
import { parseModelJson } from './parse-model-json';
import { invokeAnalyzeChat } from './analyze-constraint-service';

export type SemanticVerifyResult = {
  accepted: boolean;
  score: number;
  method: 'lexical' | 'llm' | 'lexical+llm';
  reason: string;
};

const verifySchema = z.object({
  matches: z.boolean(),
  score: z.number().min(0).max(1).default(0.5),
  reason: z.string().default(''),
}).strict();

function lexicalVerify(specs: ConstraintSpec[], originalText: string): SemanticVerifyResult {
  const batch = backTranslateBatch(specs, originalText);
  const accepted = !batch.needsConfirmation && batch.score >= BACK_TRANSLATION_GATE;
  return {
    accepted,
    score: batch.score,
    method: 'lexical',
    reason: accepted
      ? `Lexical back-translation OK (${batch.score.toFixed(2)})`
      : `Lexical back-translation below gate (${batch.score.toFixed(2)})`,
  };
}

function buildVerifyPrompt(originalText: string, specs: ConstraintSpec[]): string {
  const rendered = specs.map((spec) => humanizeConstraintSpec(spec)).join('\n');
  return `Bạn là verifier cho ràng buộc thời khoá biểu.
Câu gốc: "${originalText}"
Diễn giải máy: "${rendered}"
Trả JSON: { "matches": boolean, "score": 0..1, "reason": "..." }
matches=true khi diễn giải đúng ý (cho phép paraphrase: buổi sáng ~ tiết 1-5).`;
}

/** Optional LLM entailment verify. Falls back to lexical on errors. */
export async function verifyParseSemanticsWithLLM(
  originalText: string,
  specs: ConstraintSpec[],
  config: AIProviderConfig
): Promise<SemanticVerifyResult> {
  if (!specs.length) {
    return { accepted: false, score: 0, method: 'llm', reason: 'Không có spec để verify' };
  }
  try {
    const response = await invokeAnalyzeChat(config, [
      { role: 'system', content: 'Trả JSON duy nhất, không markdown.' },
      { role: 'user', content: buildVerifyPrompt(originalText, specs) },
    ]);
    const parsed = verifySchema.parse(parseModelJson(response.content));
    return {
      accepted: parsed.matches && parsed.score >= 0.62,
      score: parsed.score,
      method: 'llm',
      reason: parsed.reason || (parsed.matches ? 'LLM xác nhận khớp nghĩa' : 'LLM từ chối khớp nghĩa'),
    };
  } catch (error) {
    const lexical = lexicalVerify(specs, originalText);
    return {
      ...lexical,
      method: 'lexical',
      reason: `${lexical.reason}; LLM verify lỗi: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Run lexical verify, optionally adding one LLM verify call when borderline.
 */
export async function runSemanticVerify(args: {
  originalText: string;
  specs: ConstraintSpec[];
  config?: AIProviderConfig;
  useLlm?: boolean;
}): Promise<SemanticVerifyResult> {
  const lexical = lexicalVerify(args.specs, args.originalText);
  const borderline = lexical.score >= 0.45 && lexical.score < 0.8;
  if (!args.useLlm || !args.config || !borderline || args.specs.length === 0) {
    return lexical;
  }

  const llm = await verifyParseSemanticsWithLLM(args.originalText, args.specs, args.config);
  const combinedScore = lexical.score * 0.35 + llm.score * 0.65;
  const accepted = llm.accepted || (lexical.accepted && combinedScore >= BACK_TRANSLATION_GATE);
  return {
    accepted,
    score: combinedScore,
    method: 'lexical+llm',
    reason: `lexical=${lexical.score.toFixed(2)}; llm=${llm.score.toFixed(2)} (${llm.reason})`,
  };
}