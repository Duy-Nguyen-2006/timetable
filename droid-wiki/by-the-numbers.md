# By the Numbers

Data collected on 2026-05-31 (current HEAD: `cdac5b52`).

This page gives a quantitative snapshot of the Tack Timetable codebase.

## Size

**Total tracked lines (excluding node_modules, .git, release, .next, python-dist, build):** approximately 30,092 lines across all file types.

**File counts by type (source + docs + config):**

- TypeScript (`.ts` + `.tsx`): 59 files
- JavaScript (`.js` + `.mjs`): 6 files
- Python (`.py`): 11 files
- Markdown (`.md`): 25 files
- JSON (non-lockfiles): 5 files
- Other config (Dockerfile, YAML, shell, CSS, HTML): 5 files

**Total "source" files (TS/TSX/JS/MJS + Python):** 76 files

**Test files:** 16 (mix of `.test.ts`/`tsx` using Node's built-in test runner and `pytest` Python tests)

### Language breakdown (approximate lines)

The following chart shows rough distribution based on the largest files and file-type scan (exact numbers vary with every build artifact and lockfile).

```mermaid
xychart-beta
    title "Lines of code by language (approximate)"
    x-axis [TypeScript, Python, Markdown, JavaScript, Config/Other]
    y-axis "Lines" 0 --> 20000
    bar [18500, 4200, 4500, 1500, 1400]
```

**Notes on the numbers:**
- TypeScript dominates because the entire 6-stage Local Agent, the main UI canvas (`TimetableApp.tsx` at 2,982 lines), constraint system, and all supporting machinery live in `src/`.
- Python is smaller but critical: the execution host (`code_executor.py`), the full validator engine for 46 constraint kinds (`validator_engine.py`), the solver skeleton template, and sandbox wrappers.
- Markdown is inflated by the four large system prompts in `prompts/` plus the wiki and README content.
- The massive one-time deletion of `repomix-output.xml` (17,546 lines) in the delta since the previous wiki is not reflected in current size.

### Largest source files (top 10 by line count)

| File | Lines | Notes |
|------|-------|-------|
| `src/features/timetable/TimetableApp.tsx` | 2,982 | The entire interactive scheduling canvas, assignment editing, quick import, export, and agent UI integration |
| `src/features/timetable/ai/translator.ts` | 1,297 | Natural language → `ConstraintSpec` translation + fallback parser rules for all 46 kinds |
| `src/features/timetable/ai/deterministic-validator.ts` | 1,037 | Post-execution deterministic checkers (heavily expanded with the 17 new constraint kinds) |
| `python/templates/solver_skeleton.py` (and public copy) | 850 each | The audited base CP-SAT model that the Coder completes |
| `src/features/timetable/ai/translator.test.ts` | 625 | Tests for the translator and constraint parsing |
| `src/features/timetable/ai/local-agent.ts` | 582 | The 6-stage orchestrator (`runLocalAgent`) with all retry/repair/token-budget logic |
| `python/validator_engine.py` | 393 | Python-side checkers for every built-in `ConstraintKind` |
| `src/features/timetable/ai/deterministic-validator.test.ts` | 353 | Validator unit tests |
| `src/features/timetable/quick-import.ts` | 348 | Quick import text format parser and sample data |

## Activity

- **149 commits** on `master` in the 90 days preceding 2026-05-31.
- Very high recent churn: between the last wiki generation (commit `82d45e84`) and current HEAD, 18 files changed with +1,913 insertions and -17,617 deletions (the bulk of the deletion was the 17.5k-line `repomix-output.xml` artifact).
- The most actively edited areas in the recent delta were:
  - `src/features/timetable/ai/deterministic-validator.ts` (+270 lines) — new checkers for the 17 added constraint kinds
  - `src/features/timetable/ai/translator.ts` (+194 lines) — translator updates and fallback rules
  - `public/templates/solver_skeleton.py` (+838 lines) — major expansion of the template the Coder targets
  - Prompt syncing infrastructure (`public/prompts/*` and `prompts/`)
  - `src/features/timetable/ai/constraint-spec.ts` (+23 lines, the 17 new `ConstraintKind` values)
  - `src/features/timetable/ai/local-agent.ts` and repair logic
  - `.gitignore` (+111 lines) — cleanup of generated and binary artifacts

This level of activity (roughly 1.6 commits per day on average over 90 days, with concentrated bursts around constraint system expansion) indicates the project is in an intensive feature-development and hardening phase.

## Bot-attributed commits

In the most recent 50 commits on `master`:
- 2 commits (4%) were attributed to bots (`qwen.ai[bot]` and similar).
- 48 commits (96%) were from human developers (primarily "Duy").

This is a lower bound on AI-assisted work. Inline tools (e.g., Copilot-style suggestions) leave no git signature, and some "Fix BE" or prompt-tuning commits may themselves have been produced with heavy AI assistance. The project culture (documented in `AGENTS.md`) treats AI output as untrusted code that must still pass human review, impact analysis, and full test/lint gates.

## Complexity

**Average file size signals:**
- The UI layer is concentrated: one file (`TimetableApp.tsx`) holds the majority of the interactive scheduling experience.
- The AI pipeline is spread across many focused modules (`local-agent.ts`, per-stage files, `deterministic-validator.ts`, `skeleton-injector.ts`, etc.), which is healthy for testability and the mandatory impact-analysis workflow.
- The Python side is intentionally small and auditable: the execution host and validator engine together are only a few hundred lines each.

**Deepest / most complex areas (by line count and logical density):**
- Translator + fallback parser rules (now handling 46 `ConstraintKind`s with Vietnamese-school-specific semantics)
- Deterministic validator (dual TypeScript + Python implementations that must stay in sync)
- The `runLocalAgent` orchestrator (token budgeting, two separate repair loops, attempt history, event emission, deadline enforcement)

**Import / call depth:**
- The agent stages have relatively shallow direct call depth but high fan-out through the typed event system and `WorkspaceBoard` accumulator.
- `code_executor.py` is the narrow waist between the TypeScript world and the sandboxed Python world.

**Exported symbols:**
- The core public surface of the agent is small: `runLocalAgent`, the per-stage `runXxxTurn` functions, the main types (`AgentInputPayload`, `LocalAgentFinalResult`, `ConstraintSpec`, etc.), and the bridge (`executeGeneratedCode`).
- The 46 `ConstraintKind` values are the largest single enumerated surface in the system.

## Test-to-code ratio

- 16 dedicated test files for ~76 source files (~21% test files by count).
- Heavy investment in translator and validator tests (both unit and integration-style prompt behavior tests via `npm run test:prompt`).
- Python layer has its own pytest suite (`python/tests/`) covering the executor and validator engine.

The project does not publish aggregate coverage percentages in CI, but the presence of dedicated test files for the most complex and safety-critical modules (translator, deterministic-validator, skeleton injector, local-agent) is a positive signal.

---

**Cross-references:**
- See [Lore](lore.md) for the historical narrative behind the recent constraint explosion and the May 2026 codebase reset.
- See [Fun Facts](fun-facts.md) for the story of the 17.5k-line `repomix-output.xml` that briefly existed and was then deleted.
- The [AI Pipeline](../systems/ai-pipeline/index.md) and [Constraint System](../features/constraint-system.md) pages contain the detailed explanations behind the largest recent changes.
