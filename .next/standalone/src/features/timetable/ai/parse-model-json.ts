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

function escapeControlCharsInStrings(raw: string): string {
  let inString = false;
  let escaped = false;
  let changed = false;
  let repaired = '';

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        repaired += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        repaired += char;
        escaped = true;
        continue;
      }

      if (char === '"') {
        repaired += char;
        inString = false;
        continue;
      }

      if (char === '\n') {
        repaired += '\\n';
        changed = true;
        continue;
      }

      if (char === '\r') {
        repaired += '\\r';
        changed = true;
        continue;
      }

      if (char === '\t') {
        repaired += '\\t';
        changed = true;
        continue;
      }

      if (char.charCodeAt(0) < 0x20) {
        repaired += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
        changed = true;
        continue;
      }

      repaired += char;
      continue;
    }

    if (char === '"') inString = true;
    repaired += char;
  }

  return changed ? repaired : raw;
}

export function parseModelJson(content: string | undefined): unknown {
  const raw = stripCodeFence(content ?? '{}');
  const candidates = [raw];
  const extracted = extractFirstJsonObject(raw);
  if (extracted && extracted !== raw) candidates.push(extracted);
  const repaired = candidates
    .map((candidate) => escapeControlCharsInStrings(candidate))
    .filter((candidate, index, list) => candidate !== candidates[index] && list.indexOf(candidate) === index);
  candidates.push(...repaired);

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
