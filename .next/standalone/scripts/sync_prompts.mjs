import fs from 'node:fs';
import path from 'node:path';

const src = path.join('prompts');
const dst = path.join('public', 'prompts');

fs.mkdirSync(dst, { recursive: true });

for (const f of fs.readdirSync(src)) {
  if (f.endsWith('.md')) {
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
  }
}

console.log('Prompts synchronized successfully.');
