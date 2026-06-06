/**
 * Bilingual check (VAL-CROSS-014)
 * - Mỗi prompt phải có ≥ 10 ký tự tiếng Việt có dấu
 * - Không chứa nguyên đoạn văn tiếng Anh (>50 từ liên tiếp không phải tiếng Việt)
 * - Sử dụng tên giáo viên tiếng Việt: Sơn, Hương, Trang, Thúy, Hòa, Thủy, Thìn, Dung, Lan, Minh, Hoa
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const PROMPTS = [
  'prompts/translator.system.md',
  'prompts/coder.system.md',
  'prompts/repair.system.md',
];

const DIACRITIC_RE = /[ăâđêôơưĂÂĐÊÔƠƯáàảãạằẳẵặắấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵÁÀẢÃẠẰẲẴẶẮẤẦẨẪẬÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ]/;
const TEACHER_NAMES = ['Sơn', 'Hương', 'Trang', 'Thúy', 'Hòa', 'Thủy', 'Thìn', 'Dung', 'Lan', 'Minh', 'Hoa'];
const MIN_DIACRITICS = 10;

function countDiacritics(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (DIACRITIC_RE.test(ch)) count += 1;
  }
  return count;
}

function findLongEnglishRuns(text: string): string[] {
  // Match runs of 50+ ASCII words (each word is A-Za-z only, no diacritics around).
  const lines = text.split('\n');
  const offenders: string[] = [];
  let currentRun: string[] = [];
  for (const line of lines) {
    const tokens = line.split(/\s+/).filter(Boolean);
    let runInLine: string[] = [];
    for (const tok of tokens) {
      // Strip trailing punctuation
      const stripped = tok.replace(/[.,;:!?()\[\]{}'"]/g, '');
      if (/^[A-Za-z]+$/.test(stripped)) {
        runInLine.push(tok);
      } else {
        if (runInLine.length >= 12) offenders.push(runInLine.join(' '));
        runInLine = [];
      }
    }
    if (runInLine.length >= 12) offenders.push(runInLine.join(' '));
    void currentRun;
  }
  return offenders;
}

function checkFile(file: string): { ok: boolean; issues: string[] } {
  const full = path.join(process.cwd(), file);
  if (!existsSync(full)) return { ok: false, issues: [`File not found: ${file}`] };
  const text = readFileSync(full, 'utf8');
  const issues: string[] = [];
  const diacriticCount = countDiacritics(text);
  if (diacriticCount < MIN_DIACRITICS) {
    issues.push(`Only ${diacriticCount} diacritics (need ≥ ${MIN_DIACRITICS})`);
  }
  const englishRuns = findLongEnglishRuns(text);
  if (englishRuns.length > 0) {
    issues.push(`Found ${englishRuns.length} long English paragraph(s) (≥12 ASCII words in a row): ${englishRuns[0]?.slice(0, 60)}…`);
  }
  // Teacher names: at least 3 of the canonical names should appear in examples.
  const present = TEACHER_NAMES.filter((n) => text.includes(n));
  if (present.length < 3) {
    issues.push(`Only ${present.length} canonical Vietnamese teacher names found (need ≥ 3): ${present.join(', ')}`);
  }
  return { ok: issues.length === 0, issues };
}

let allOk = true;
for (const file of PROMPTS) {
  const result = checkFile(file);
  if (result.ok) {
    console.log(`OK   ${file}`);
  } else {
    allOk = false;
    console.error(`FAIL ${file}`);
    for (const issue of result.issues) {
      console.error(`  - ${issue}`);
    }
  }
}

if (!allOk) {
  console.error('\nBILINGUAL_CHECK_FAIL');
  process.exit(1);
}
console.log('\nBILINGUAL_CHECK_OK');
