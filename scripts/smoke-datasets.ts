#!/usr/bin/env -S npx tsx
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseQuickImportText } from "../src/features/timetable/quick-import";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const datasetsPath = resolve(repoRoot, "datasets.txt");

const raw = readFileSync(datasetsPath, "utf8").replace(/\r\n?/g, "\n");

const parts = raw.split(/^(DATASET\s+\d+)\s*$/m);
const blocks: { name: string; body: string }[] = [];
for (let i = 1; i < parts.length; i += 2) {
  blocks.push({ name: parts[i].trim(), body: parts[i + 1]?.trim() ?? "" });
}

if (blocks.length === 0) {
  console.error("[datasets-smoke] no DATASET blocks found in datasets.txt");
  process.exit(2);
}

let failures = 0;
for (const { name, body } of blocks) {
  process.stdout.write(`[datasets-smoke] ${name}: `);
  try {
    const data = parseQuickImportText(body);
    const summary = {
      teachers: data.teachers.length,
      subjects: data.subjects.length,
      classes: data.classes.length,
      assignments: data.assignments.length,
      hard: data.hardConstraints.length,
      soft: data.softConstraints.length,
      days: data.selectedDays.length,
      sessions: data.selectedSessions.length,
    };
    if (data.assignments.length === 0 || data.classes.length === 0) {
      throw new Error(`empty payload: ${JSON.stringify(summary)}`);
    }
    console.log("OK", JSON.stringify(summary));
  } catch (err) {
    failures += 1;
    console.log("FAIL", err instanceof Error ? err.message : String(err));
  }
}

if (failures > 0) {
  console.error(`[datasets-smoke] ${failures}/${blocks.length} datasets failed to parse`);
  process.exit(1);
}

console.log(`[datasets-smoke] ${blocks.length}/${blocks.length} datasets parsed OK`);
