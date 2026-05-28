import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, 'python', 'templates', 'solver_skeleton.py');
const targetDir = path.join(repoRoot, 'public', 'templates');
const targetPath = path.join(targetDir, 'solver_skeleton.py');

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing canonical solver skeleton: ${sourcePath}`);
}

fs.mkdirSync(targetDir, { recursive: true });
const sourceContent = fs.readFileSync(sourcePath, 'utf8');
const currentTarget = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null;

if (currentTarget !== sourceContent) {
  fs.writeFileSync(targetPath, sourceContent, 'utf8');
  console.log('Synced solver skeleton template to public/templates.');
} else {
  console.log('Solver skeleton template already in sync.');
}
