# Translator Stage

Active contributors: Duy

The Translator is the first stage of the 6-stage Local Agent pipeline. It converts raw natural language constraints (Vietnamese scheduling rules expressed as required or preferred) into a structured `ConstraintSpec[]` array. It supports 35 `ConstraintKind` values (aspirational target in planning docs was 46) with a hybrid deterministic + LLM approach that minimizes latency and token usage while guaranteeing a safe, complete output even when the model fails.

## Purpose

- Accept `AgentInputPayload.constraints` (free-form Vietnamese text + `required`/`preferred` type + optional weight).
- Emit normalized `ConstraintSpec[]` carrying one of the 35 known kinds, correct severity, params, weight, tags, and diagnostic notes.
- Never drop hard constraints: unknown or unparseable hard inputs become `custom_dsl` with `notes: "fallback_parser:UNPARSED_HARD"` rather than being discarded.
- Feed the deduplicated specs into the Planner stage and the `WorkspaceBoard`.

Room / capacity constraints are deliberately suppressed at this boundary (turned into `info` `custom_dsl` with `notes: "ignored:room_constraint"`).

## How it works (hybrid path)

```mermaid
flowchart TD
    In[AgentInputPayload<br/>raw constraints + dataset] --> Fallback[fallbackFromRuleParser<br/>lib/constraint-parser.ts + 100+ regex rules]
    Fallback -->|kind !== custom_dsl| Deterministic[Deterministic specs]
    Fallback -->|unparsed remain custom_dsl| LLM[LLM path only for remainder<br/>prompts/translator.system.md]
    LLM --> Parse[parseModelJson<br/>fence strip + first-object + control-char repair]
    Parse --> Zod[Zod schema validation<br/>35-kind enum + ConditionExpr]
    Deterministic --> Merge[sanitizeSpecs]
    Zod --> Merge
    Merge -->|entity validation<br/>auto_base tagging<br/>weekly exact inference<br/>room suppression<br/>re-invoke fallback on LLM mistakes| Sanitized[Sanitized ConstraintSpec[]]
    Sanitized --> Dedupe[dedupeConstraintSpecs<br/>semantic signature in local-agent.ts]
    Dedupe --> Out[ConstraintSpec[]<br/>deduped → Planner + board]
```

1. **Deterministic first pass** — `fallbackFromRuleParser` (in `translator.ts`) runs on every constraint. After the May 2026 modularization, text utilities, fallback predicates, normalization, and auto-base tagging live in `translator-text.ts`; period expansion and day/session-aware builders live in `translator-periods.ts`. The facade in `translator.ts` delegates to these helpers plus `splitFallbackConstraintText` (splits on `;`, `\n`, `và`, `đồng thời`, and special-cases `nếu ... thì`) and the lower-level `parseConstraint` from `src/lib/constraint-parser.ts`. Many common patterns (block day/period/slot, max consecutive, allowed days/periods, subject pinning, daily limits, if-then, pair_not_same_slot, session_limit, subject_group_*, assignment pinning/spread, etc.) are fully recognized without any LLM call.
2. **Selective LLM** — Only the originals that produced at least one `custom_dsl` are packaged with rich context (teachers, classes, subjects, days, periods, periodsByDay built from the dataset) and sent to the model via `invokeChat` (temperature 0, `json_schema` response format).
3. **Robust extraction** — `parseModelJson` (in `parse-model-json.ts`) strips fences, extracts the first top-level object, and repairs embedded control characters before `JSON.parse`. The result is validated with Zod against the exact 35-kind enum and the full `ConstraintSpec` shape.
4. **Sanitize & enrich** — `sanitizeSpecs`:
   - Downgrades unknown entities (teacher/class/subject/day) to `custom_dsl` with diagnostic notes.
   - Suppresses all room-related text → `info` `custom_dsl` + `ignored:room_constraint`.
   - Tags auto-generated weekly exacts and "every class/subject must have exactly N" patterns as `auto_base`.
   - Re-invokes the fallback parser on certain LLM outputs that are known to be fragile (e.g., session-scoped blocks, missing periods).
   - Applies weight from the original input constraint when present.
5. **Deduplication** (orchestrator) — `dedupeConstraintSpecs` in `local-agent.ts` uses a stable semantic signature (`constraintSignature`) that ignores id and original text. This prevents Planner/Coder bloat from near-duplicate specs produced by mixed deterministic + LLM paths.

On any error in the LLM branch (network, bad JSON after repair, schema violation), the turn safely returns the pure output of `fallbackFromRuleParser(input)` — the pipeline never loses constraints.

## ConstraintKind surface (35 kinds)

See the authoritative definition and grouping in [Constraint System](../features/constraint-system.md). The enum lives in:

- `src/features/timetable/ai/constraint-spec.ts` — `ConstraintKind` union (exactly 35 literals)
- `src/features/timetable/ai/constraint-registry.ts` — `CONSTRAINT_REGISTRY` with groups and `hasChecker` flags

The 17 new kinds added in the coordinated commit that also updated the fallback parser and added deterministic checkers are fully supported by the translator rules (including `if_then` with `ConditionExpr`, `pair_not_same_slot`, `session_limit`, `subject_group_daily_limit`, `subject_min_gap_days`, `subject_daily_max_periods`, `assignment_*`, `teacher_min_per_day`, `teacher_no_gaps`, `teacher_allowed_*`, `class_no_gaps`, `class_subjects_not_same_day`, etc.).

## Prompt contract

The single source of truth is `prompts/translator.system.md` (version 3.0.0, synced at build time to `public/prompts/`).

It contains:
- The complete 35-row kind table with "when to use" and required params.
- `ConditionExpr` recursive schema for `if_then`.
- `subject_consecutive` Rule A semantics (floor division for required consecutive blocks; remainder may be singletons).
- Strict rules (exact label matching, day ids only, no invention, split independent clauses, weight propagation).
- Few-shot examples for complex implications and global limits.

Changes to this file are treated as first-class behavioral changes and must pass `npm run test:prompt`.

## Error handling & safe degradation

- LLM path is best-effort only. Total failure → pure deterministic output.
- `parseModelJson` failures after all repair attempts throw → caught by the outer `runTranslatorTurn` try/catch → fallback.
- Entity validation in `sanitizeSpecs` downgrades rather than drops.
- Hard constraints that remain `custom_dsl` after all passes carry `notes: "fallback_parser:UNPARSED_HARD"` so downstream (Validator, Repair) can surface coverage warnings.
- No constraints are ever silently dropped.

There is no numeric confidence scoring emitted by the current implementation. The design instead provides deterministic-first high-confidence parsing for the vast majority of real-world Vietnamese scheduling language, with LLM only as a safety net for novel phrasing.

## Caching, events, and call site

In `src/features/timetable/ai/local-agent.ts`:

- `pickStageConfig` selects any per-stage model override (`modelTranslator`).
- Stable cache key for translator includes the full structural input (assignments, constraints, days, sessions, periodCounts, deletedPeriods) + chosen model.
- On cache hit, `usageTokens` is reported as 0 for budget accounting.
- After successful translator turn: `stage_completed` event carries `(n specs, m after dedupe)`.
- Deduplication and auto-base filtering (weekly exacts marked `auto_base` are removed before solver constraints) happen immediately after translator.
- The resulting specs are stored on the `WorkspaceBoard` and passed (compressed) to Planner.

The translator turn is the only stage that can legally return zero LLM calls for a non-empty constraint set (when the deterministic parser covers everything).

## Key source files

All paths are repository-root relative.

| Repository-root path | Role |
|----------------------|------|
| `src/features/timetable/ai/translator.ts` | `runTranslatorTurn`, `fallbackFromRuleParser`, `sanitizeSpecs`, `splitFallbackConstraintText`, Zod schemas, weight/tag handling, hybrid LLM + deterministic merge, context builders (`buildTranslatorPeriods*`) |
| `prompts/translator.system.md` | Authoritative system prompt (v3.0.0): full ConstraintKind table, ConditionExpr, Rule A semantics, few-shot examples, strict output rules |
| `src/features/timetable/ai/constraint-spec.ts` | Core domain: `ConstraintKind` (35 values), `ConstraintSpec`, `ConstraintSeverity`, `ConditionExpr`, `ConstraintTag` |
| `src/features/timetable/ai/local-agent.ts` | Orchestrator call site, stable cache key construction, `dedupeConstraintSpecs` + `constraintSignature`, event emission (`stage_started`/`stage_completed`), budget integration, auto-base filtering before solver |
| `src/features/timetable/ai/parse-model-json.ts` | `parseModelJson` — fence stripping, first top-level object extraction, control-character repair in strings |
| `src/lib/constraint-parser.ts` | Low-level `parseConstraint` rule engine (many legacy + new patterns exercised by the high-level fallback) |
| `src/features/timetable/ai/types.ts` | `TranslatorTurnResult`, `AgentInputPayload`, `ConstraintItemInput`, `LocalAgentConfig` (modelTranslator override) |
| `src/features/timetable/ai/constraint-registry.ts` | `CONSTRAINT_REGISTRY`, `CHECKED_KINDS` — drives fail-closed behavior for hard constraints without checkers |

## Related pages

- [AI Pipeline Overview](systems/ai-pipeline/index.md) — full 6-stage flow, TokenBudgetGuard, repair loops, event model
- [Constraint System](../features/constraint-system.md) — complete 35-kind enumeration with groups, severity/weight/tags semantics, automatic checkers (TS + Python), natural language parsing overview
- [Validator Stage](systems/ai-pipeline/validator.md) — how the specs produced here are deterministically checked after execution
- [Python Execution](systems/python-execution.md) — sandbox context for the overall agent (translator itself never executes code)

## Notes & known limitations

- The "46 kinds" figure in some older planning artifacts was aspirational. The implemented surface with parser rules + deterministic checkers (as of the coordinated cdac5b5 change) is 35.
- `subject_group` and `custom_dsl` (without executable `pythonPredicate` usage) have no automatic checkers; hard instances of the latter are reported as coverage failures by the validator.
- Room constraints are intentionally ignored at the translator boundary for scope control; this is documented behavior, not a bug.
- All changes that affect parsing (new kinds, prompt edits, fallback rule additions, sanitize logic) are behavioral changes and must pass prompt validation + relevant tests.

This page intentionally focuses on the translator stage contract and implementation. Broader pipeline orchestration lives in the AI Pipeline index; constraint semantics and checker details live in the Constraint System page.
