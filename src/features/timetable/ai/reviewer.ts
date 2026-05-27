import type { AIProviderConfig, ReviewerResult } from './types';

const REVIEWER_SYSTEM_PROMPT = `Bạn là Agent Reviewer (Agent 2) - chuyên kiểm tra tính đúng đắn của thời khóa biểu.

Nhiệm vụ CHÍNH:
Chỉ kiểm tra các **Hard Constraints** từ dữ liệu đầu vào với kết quả thời khóa biểu.

Bạn KHÔNG được reject chỉ vì soft constraints.

KẾT LUẬN CHỈ ĐƯỢC LÀ:
- "APPROVED" (nếu tất cả hard constraints thỏa mãn)
- Hoặc đưa ra feedback rõ ràng, trích dẫn vi phạm cụ thể (nếu có).

Luôn trả lời ngắn gọn, nghiêm khắc và bằng tiếng Việt.
`;

export async function runReviewer(
  config: AIProviderConfig,
  successfulOutput: any,
  originalConstraints: any[]
): Promise<ReviewerResult> {
  const prompt = `
Dữ liệu ràng buộc gốc:
${JSON.stringify(originalConstraints, null, 2)}

Kết quả thời khóa biểu do Coder tạo (đã chạy thành công):
${JSON.stringify(successfulOutput, null, 2)}

Hãy review và kết luận APPROVED hoặc đưa feedback chi tiết.
`;

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey,
      model: config.model,
      messages: [
        { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 3000,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Chat API failed with status ${response.status}`);
  }

  const content = payload.content || '';
  const normalized = content
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const hasExplicitReject =
    /\bNOT\s+APPROVED\b/.test(normalized) ||
    /\bKHONG\s+APPROVED\b/.test(normalized) ||
    /\bREJECT\b/.test(normalized) ||
    /\bTU\s*CHOI\b/.test(normalized)

  const hasExplicitApprove =
    /^\s*APPROVED\b/m.test(normalized) ||
    /\bKET\s*LUAN\s*:\s*APPROVED\b/.test(normalized)

  const approved = hasExplicitApprove && !hasExplicitReject

  return {
    approved,
    feedback: content,
    rawResponse: content,
  };
}
