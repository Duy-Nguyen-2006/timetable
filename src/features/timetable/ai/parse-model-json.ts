function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;

  let inString = false;
  let escaped = false;
  let depth = 0;

  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function parseModelJson(content: string | undefined): unknown {
  const raw = stripCodeFence(content ?? '{}');
  const candidates = [raw];
  const extracted = extractFirstJsonObject(raw);
  if (extracted && extracted !== raw) candidates.push(extracted);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  const preview = raw.slice(0, 220);
  throw new Error(`Invalid JSON from model response. Preview: ${preview}`);
}

export const __parseModelJsonInternal = {
  extractFirstJsonObject,
  stripCodeFence,
};
