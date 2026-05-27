import OpenAI from 'openai';
import type { AIProviderConfig, AgentInputPayload, CoderTurnResult } from './types';

const CODER_SYSTEM_PROMPT = `Bạn là một kỹ sư OR-Tools CP-SAT chuyên nghiệp.

Mục tiêu: Viết một script Python hoàn chỉnh sử dụng ortools.sat.python.cp_model để giải bài toán thời khóa biểu.

QUY TẮC BẮT BUỘC:
- Đọc dữ liệu từ file "input.json" nằm cùng thư mục (đã được ghi sẵn bởi ứng dụng).
- Code phải in ra chuỗi "SOLUTION FOUND" (không phân biệt hoa thường) khi tìm được lời giải hợp lệ.
- Kết quả cuối cùng phải in ra (hoặc ghi file) JSON có cấu trúc:
  {
    "classes": [...],
    "days": [...],
    "periods": [...],
    "schedule": [
      {"class": "...", "day": "...", "period": "...", "subject": "...", "teacher": "..."}
    ]
  }
- Ưu tiên viết code đúng và sạch ngay từ lần đầu.
- Nếu bạn nhận được lỗi từ lần chạy trước, hãy sửa code và đưa ra phiên bản mới hoàn chỉnh.

Bạn chỉ được phép trả lời bằng code Python (bọc trong \`\`\`python ... \`\`\`) hoặc giải thích ngắn gọn + code.
`;

export async function runCoderTurn(
  config: AIProviderConfig,
  input: AgentInputPayload,
  previousAttempts: Array<{ code: string; result: any }>
): Promise<CoderTurnResult> {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
  });

  const messages: any[] = [
    { role: 'system', content: CODER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Dữ liệu bài toán (input.json):\n${JSON.stringify(input, null, 2)}\n\nHãy viết script Python hoàn chỉnh.`,
    },
  ];

  // Feed previous attempts + errors back to the model (this is how "self-debug" works)
  for (const attempt of previousAttempts.slice(-3)) {
    messages.push({
      role: 'assistant',
      content: attempt.code,
    });
    messages.push({
      role: 'user',
      content: `Kết quả chạy lần trước:\n${JSON.stringify(attempt.result, null, 2)}\n\nHãy sửa code và đưa ra phiên bản mới.`,
    });
  }

  const completion = await client.chat.completions.create({
    model: config.model,
    messages,
    temperature: 0.2,
    max_tokens: 8000,
  });

  const content = completion.choices[0]?.message?.content || '';
  // Extract code block
  const codeMatch = content.match(/```python\n([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[1].trim() : content.trim();

  return {
    code,
    explanation: content,
    rawResponse: content,
  };
}
