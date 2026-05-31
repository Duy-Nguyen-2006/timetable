import { readFile } from 'node:fs/promises';

async function main() {
  const content = await readFile('prompts/coder.system.md', 'utf8');
  const required = ['custom_dsl', 'covered_constraint_ids', 'severity == "hard"'];
  const missing = required.filter((token) => !content.includes(token));

  if (missing.length > 0) {
    console.error(`Coder prompt missing required tokens: ${missing.join(', ')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
