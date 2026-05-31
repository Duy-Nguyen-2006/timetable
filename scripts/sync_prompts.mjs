import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceDir = path.join(root, 'prompts');
const targetDir = path.join(root, 'public', 'prompts');

await mkdir(targetDir, { recursive: true });
const entries = await readdir(sourceDir, { withFileTypes: true });
await Promise.all(
  entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => copyFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name)))
);
