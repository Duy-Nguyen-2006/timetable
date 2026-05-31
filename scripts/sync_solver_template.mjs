import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'python', 'templates', 'solver_skeleton.py');
const targetDir = path.join(root, 'public', 'templates');
const target = path.join(targetDir, 'solver_skeleton.py');

await mkdir(targetDir, { recursive: true });
await copyFile(source, target);
