# Scoped Survey Context — Incremental Wiki Update

**Date:** 2026-05-31  
**Base wiki commit:** `2ca87b44cd2c8f3ec1d6b26f129ae5697e3405e3`  
**Current HEAD:** `cb55d90` ("Init Harness Engineering")  
**Mode:** INCREMENTAL (7690 lines total diff; 3205 lines net in 26 source files excluding droid-wiki/*)

---

## Diff Summary

**Changed source files (26 files, +1765/-1440):**

### AI Pipeline Refactoring (modularization)
- `src/features/timetable/ai/local-agent.ts` — major: extracted constants, utilities, cache logic
- `src/features/timetable/ai/local-agent-limits.ts` — **NEW** (MAX_* constants, cache config)
- `src/features/timetable/ai/local-agent-utils.ts` — **NEW** (emit, pickStageConfig, resolveSolverRuntime, budget helpers, violation signature, dedupe)
- `src/features/timetable/ai/stage-cache.ts` — **NEW** (proper TTL-based LRU cache, replaced inline Map)
- `src/features/timetable/ai/translator.ts` — major: extracted text/period helpers
- `src/features/timetable/ai/translator-text.ts` — **NEW** (includesLabel, extract*, normalizeConstraintText, is*Text predicates, splitFallbackConstraintText, markAutoBaseSpec, etc.)
- `src/features/timetable/ai/translator-periods.ts` — **NEW** (buildTranslatorPeriods*, periodsForSession)
- `src/features/timetable/ai/deterministic-validator.ts` — major: extracted helpers
- `src/features/timetable/ai/validator-helpers.ts` — **NEW** (toPeriod, slotKey, pushViolation, evaluateCondition, checkBaseConstraints)
- `src/features/timetable/ai/constraint-registry.ts` — minor (+8 lines)
- `src/features/timetable/ai/types.ts` — minor (+40 lines, likely new exports)
- `src/features/timetable/ai/python-bridge.ts`, `planner.ts`, `coder.ts`, `repair.ts`, `skeleton-injector.ts`, etc. — **unchanged or negligible**

### UI Wizard Component Extraction (from monolithic TimetableApp.tsx)
- `src/features/timetable/TimetableApp.tsx` — **major reduction** (-865 lines): now orchestrator + state, delegates pages to components
- `src/features/timetable/components/PreviewPage.tsx` — **NEW** (period grid preview + delete/restore)
- `src/features/timetable/components/SetupPages.tsx` — **NEW** (SelectPage, PeriodsPage, DetailsPage, etc.)
- `src/features/timetable/components/TimetableFields.tsx` — **NEW** (DayTile, SessionTile, PeriodControl, MetricCard, SelectField)
- `src/features/timetable/assignment-helpers.tsx` — **NEW**
- `src/features/timetable/cache.ts` — **NEW**
- `src/features/timetable/solver-ui.ts` — **NEW**
- `src/features/timetable/types.ts` — **NEW** (UI-specific types)

### Other
- `src/app/api/ai/python-execute/route.ts` — minor (+2)
- `python/code_executor.py` — minor (+11)
- `python/templates/solver_skeleton.py` + `public/templates/solver_skeleton.py` — minor (+2 each)
- `repomix.config.json` — **NEW** (tooling config, not runtime)
- `AGENTS.md`, `CLAUDE.md`, `next-env.d.ts` — documentation / generated

**No new top-level subsystems.** No files deleted. No routes, features, or deployment targets added.

---

## Affected Wiki Pages (Must Update)

These pages contain **directory layouts**, **key abstractions tables**, **file reference tables**, **flow diagrams**, or **"how it works"** sections that reference the old monolithic structure:

1. **`overview/index.md`**
   - Directory layout shows flat `ai/` with all stages in one place
   - Key abstractions table references old file locations
   - Entry points for modification section lists old paths
   - Integration points mention `local-agent.ts` as single file

2. **`overview/architecture.md`**
   - High-level layers diagram references old stage file organization
   - "Layer 2: Local Agent Pipeline" section describes stages with old file paths
   - Security model and observability sections are stable but should be verified

3. **`overview/getting-started.md`**
   - Dev/build commands reference sync hooks (unchanged behavior, but verify any new npm scripts)

4. **`systems/ai-pipeline/index.md`**
   - **Primary impact.** Directory layout tree is now stale.
   - Key abstractions table lists old file locations.
   - "How it works" flow and Mermaid diagram are logically stable but should reference new module boundaries.
   - Integration points, event emission, and call sites need path updates.
   - "Entry points for modification" must reflect new module structure.
   - Key source files table must be updated (new files + reduced local-agent.ts).

5. **`systems/ai-pipeline/translator.md`**
   - "How it works (hybrid path)" diagram and prose reference `translator.ts` internals that moved.
   - File reference table and "Key source files" need new translator-*.ts entries.
   - Prompt contract and error handling sections are stable.

6. **`systems/ai-pipeline/validator.md`**
   - "Core Entry Points" and "Key Source Files" sections reference monolithic `deterministic-validator.ts`.
   - Must document `validator-helpers.ts` split.
   - CP-SAT round-trip and coverage logic sections are stable.

7. **`features/scheduling-wizard.md`**
   - **Primary impact.** "Directory layout" shows only `TimetableApp.tsx` + ai/.
   - Key abstractions describe internal React state that is now partially delegated.
   - "How it works" user flow is stable, but "Key source files" table must list the three new component files.
   - "Entry points for modification" must acknowledge the split (UI pages live in `components/`).

8. **`features/constraint-system.md`**
   - Minor: `constraint-registry.ts` grew slightly; verify `CHECKED_KINDS` / registry surface is still accurate.
   - No new kinds added in this diff.

9. **`how-to-contribute/patterns-and-conventions.md`**
   - GitNexus impact analysis rule is unchanged and still applies.
   - Security-first execution section is stable.
   - Verify no new patterns introduced by the refactoring (e.g., barrel exports, test colocations).

10. **`by-the-numbers.md`**
    - Always refresh (git history, churn, file counts, complexity metrics).

11. **`lore.md`**
    - Consider adding a brief "Modularization era" entry (May 2026) describing the AI pipeline and UI extraction. Not required if the change is considered internal refactoring without user-visible impact.

---

## Pages That Can Be Copied Unchanged

These pages have **no source changes** affecting their content:

- `overview/glossary.md` — terms and definitions unchanged
- `how-to-contribute/development-workflow.md`, `testing.md`, `debugging.md`, `tooling.md`
- `features/index.md` — still two features (Scheduling Wizard, Constraint System)
- `systems/index.md` — still three systems (AI Pipeline, Python Execution, Validation)
- `systems/ai-pipeline/planner.md`, `coder.md`, `repair.md` — stage contracts unchanged; only orchestrator and translator/validator internals moved
- `systems/python-execution.md` — no changes to sandbox, daemon, or executor
- `systems/validation.md` — high-level validation data flow and Python engine description stable
- `reference/index.md`, `reference/configuration.md`, `reference/data-models.md`, `reference/dependencies.md`
- `maintainers.md`
- `fun-facts.md` — no new easter eggs or trivia from this diff

---

## New Areas Needing Pages

**None.**

- `repomix.config.json` is a dev tooling config (similar to eslint.config.mjs); does not warrant a page.
- The component extraction (`components/`) is internal to the Scheduling Wizard feature; it does not create a new top-level feature or system.
- No new deployment targets, API surfaces, or primitives.

---

## Areas Needing Page Removal

**None.**

- No subsystems were deleted.
- All existing wiki page paths still map to live source.

---

## Nature of the Change (for Sub-Agent Context)

This is a **pure refactoring / modularization** commit:

- **AI layer:** Split three monolithic files (`local-agent.ts`, `translator.ts`, `deterministic-validator.ts`) into focused modules for limits, utilities, text helpers, period logic, validator helpers, and a proper TTL-based stage cache. Behavior, event contracts, and prompt interactions are unchanged.
- **UI layer:** Extracted three page-level components and a few helper modules from the 118 kLOC `TimetableApp.tsx` monolith. The wizard is now an orchestrator + state container; individual pages (select, periods, preview, details, etc.) are delegated.
- **Cross-cutting:** GitNexus rules, prompt sync, sandbox security model, and the 6-stage pipeline contract remain identical.

**Implications for wiki:**
- Update all **directory layout trees** and **file reference tables**.
- Update **"Key abstractions"** and **"Key source files"** tables to reflect new module locations.
- Update **"Entry points for modification"** guidance to point at the correct new files.
- Architecture diagrams and flow descriptions are logically stable; only file paths in captions or "see also" lists need refresh.
- No new feature or system pages required.
- No content removal required.

---

## Recommended Incremental Execution Plan

1. **Copy unchanged pages** from `droid-wiki/` (or prior base) into a fresh `droid-wiki/` output directory.
2. **Delegate sub-agents** (or direct edits) for the 11 affected pages listed above, providing each:
   - The scoped survey context (this document)
   - The existing page content (for structural preservation)
   - Explicit instructions: "Update directory layouts, file tables, and entry points to reflect the new module splits. Do not change conceptual explanations or diagrams unless file paths appear in them."
3. **Refresh** `by-the-numbers.md` (always) and optionally `lore.md`.
4. **Run assembly:** cross-link audit, write `.wiki-meta.json` with updated `pageOrder` (same order, updated timestamps/commit), verify all `index.md` files exist.
5. **Upload** via `droid wiki-upload`.

---

## Open Questions for Sub-Agents (if delegated)

- For `systems/ai-pipeline/index.md`: Should the stage sub-pages (translator.md, validator.md, etc.) be updated in the same agent batch, or sequentially after the index is finalized?
- For `lore.md`: Is the modularization commit significant enough to warrant a new "era" bullet, or is it internal enough to be summarized in a single sentence under an existing era?
- For `overview/architecture.md`: The Mermaid diagram shows logical layers; should the caption or legend be updated to mention the new module boundaries, or is the current abstraction level sufficient?

---

**End of scoped survey context.**
