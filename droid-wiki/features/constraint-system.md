# Constraint System

Active contributors: Duy

The Constraint System is the heart of Tack Timetable's domain model. All scheduling requirements — whether expressed in natural language or structured form — are normalized into `ConstraintSpec` records carrying one of the built-in `ConstraintKind` values. These flow from the Translator stage through Planner, Coder, deterministic validation (both TypeScript and Python), and the Repair loop.

## The 35 ConstraintKind Values (as of cdac5b5)

The May 31 2026 commit `cdac5b5` ("feat: add 17 new built-in constraint kinds with checkers and fallback parser rules") expanded the system from a smaller base to the current 35 kinds, adding deterministic checkers and translator fallback rules in a single coordinated change.

Constraints are grouped by the primary entity they constrain:

### Teacher Constraints (10)
- `teacher_block_day` — teacher cannot teach on a specific day
- `teacher_block_period` — teacher cannot teach a specific period (any day)
- `teacher_block_slot` — teacher cannot teach a specific day+period
- `teacher_max_per_day` — maximum periods per day for a teacher
- `teacher_max_consecutive` — maximum consecutive periods for a teacher
- `teacher_max_working_days` — maximum working days per week (or min days off)
- `teacher_min_per_day` — minimum periods per day for a teacher
- `teacher_no_gaps` — teacher schedule must be gap-free on each day
- `teacher_allowed_days` — teacher may only teach on listed days
- `teacher_allowed_periods` — teacher may only teach listed periods

### Subject Constraints (7)
- `subject_pin_period` — subject must be scheduled only in listed periods (optionally scoped to classes)
- `subject_consecutive` — subject requires consecutive blocks of N periods (Rule A semantics: floor division for required runs; remainder may be singletons)
- `subject_max_consecutive` — subject may not have more than N consecutive periods on the same day/class
- `subject_allowed_days` — subject may only be scheduled on listed days
- `subject_min_gap_days` — minimum gap (in schedule days) between two occurrences of the subject for a class
- `subject_daily_max_periods` — maximum periods of the subject per day for a class
- `subject_group_daily_limit` — named group of subjects may appear at most N distinct subjects per day per class

### Class Constraints (8)
- `class_block_day` — class has no lessons on a specific day
- `class_block_period` — class has no lessons in a specific period
- `class_block_slot` — class has no lessons on a specific day+period
- `class_max_per_day` — class may have at most N periods on any day
- `class_min_per_day` — class must have at least N periods on any day
- `class_no_gaps` — class schedule must be contiguous (no gaps) each day
- `class_no_double_subject_day` — class may not repeat the same subject more than maxPerDay times on one day (default 1)
- `class_subjects_not_same_day` — listed subjects may not appear together on the same day for a class (with maxSubjectsPerDay)

### Assignment Constraints (5)
- `assignment_pin_slot` — specific assignment must occupy exactly one given day+period
- `assignment_block_slot` — specific assignment must not occupy a given day+period
- `assignment_allowed_slots` — assignment entries must lie within an explicit list of slots
- `assignment_spread_days` — assignment must be spread across at least minDays distinct days
- `weekly_periods_exact` — total periods for an assignment (or teacher/subject/class filter) must exactly match the declared weekly count (auto_base instances are emitted as `info` severity)

### Global / Conditional / Other (5)
- `if_then` — conditional implication: if a `ConditionExpr` holds, then apply the listed sub-constraints
- `pair_not_same_slot` — two teachers (or assignments) must never share the same slot (optionally scoped to a day)
- `session_limit` — teacher may teach at most maxPeriods in a single session/buổi
- `subject_group` — declarative grouping (no automatic checker; used for downstream logic)
- `custom_dsl` — fallback for unparseable natural language or room constraints (ignored by design); carries `pythonPredicate` or `naturalLanguage`; never auto-checked

`resource_capacity` is a historical alias that is stripped at runtime.

See `src/features/timetable/ai/constraint-registry.ts` for the authoritative `CONSTRAINT_REGISTRY` with groups, `hasChecker` flags, and required params.

## Severity, Weight, and Tags

Every `ConstraintSpec` carries:

- `severity`: `"hard" | "soft" | "info"`
  - `hard`: must be satisfied; violations cause validation to fail the schedule.
  - `soft`: desirable; violations are recorded but do not fail the schedule. The solver (when using `maximize_soft` objective) and repair logic attempt to satisfy them.
  - `info`: informational / auto-generated base constraints (e.g., `auto_base` weekly exacts, ignored room constraints). Never treated as hard requirements.
- `weight` (optional, soft only): positive integer multiplier for the soft penalty/reward (default 1 when omitted).
- `tags`: `("auto_base" | "user_required" | "user_preferred")[]` — used to mark system-generated or UI-origin constraints.
- `notes`: free-form edge-case or diagnostic text (e.g., `fallback_parser:UNPARSED_HARD`, `ignored:room_constraint`).

The deterministic validator (both TS and Python) partitions violations into `hardViolations` and `softViolations` and reports `hardCoverageComplete` (fail-closed: any hard constraint lacking a checker is treated as a coverage failure).

## Data Flow (ConstraintSpec Lifecycle)

```mermaid
flowchart TD
    NL[Raw natural language constraints<br/>+ severity hints] -->|Translator stage| T[runTranslatorTurn<br/>src/features/timetable/ai/translator.ts]
    T -->|LLM call (only for unparsed)| LLM[OpenAI-compatible model<br/>prompts/translator.system.md]
    T -->|Deterministic fallback| Fallback[fallbackFromRuleParser<br/>+ parseConstraint in lib/constraint-parser.ts]
    LLM --> Sanitize[sanitizeSpecs + reparse loops]
    Fallback --> Sanitize
    Sanitize --> Specs[ConstraintSpec[]<br/>35 kinds, severity, weight, tags]
    Specs --> Planner[Planner stage<br/>Plan.decisionVars, constraintOrder, objective]
    Planner --> Coder[Coder stage<br/>skeleton injection + generated solver]
    Coder --> Exec[Sandboxed Python execution<br/>code_executor.py]
    Exec --> ValidatorTS[validateSchedule (TS)<br/>deterministic-validator.ts<br/>base clashes + per-kind checkers]
    Exec --> ValidatorPY[validate_schedule (Python)<br/>validator_engine.py<br/>parallel implementations]
    ValidatorTS --> VReport[DeterministicValidationReport<br/>ok, hard/soft pass, violations, unchecked, hardCoverageComplete]
    ValidatorPY --> VReport
    VReport -->|Violations present| Repair[Repair stage<br/>applyRepairPatches + runRepairTurn]
    Repair -->|Re-invoke Coder/Validator| Coder
    VReport -->|No hard violations| Final[Validated Schedule<br/>export / UI]
```

The same `ConstraintSpec` objects are used for:
- Prompting the Planner (constraint ordering, reification, objective choice)
- Guiding the Coder (which skeleton templates and patterns to emit)
- Post-execution deterministic validation (never trust solver output alone)
- Violation-driven Repair (the only stage that sees prior failure context)

## Automatic Checkers

Deterministic checkers exist for 33 of the 35 kinds (all except `subject_group` and `custom_dsl`).

**TypeScript side** (`src/features/timetable/ai/deterministic-validator.ts`):
- `checkBaseConstraints`: teacher/class slot clashes + assignment weekly exact match against `DeterministicValidationContext.assignments`.
- Per-kind `CheckFn` implementations (e.g., `checkTeacherBlockDay`, `checkSubjectConsecutive`, `checkIfThen` with recursive `evaluateCondition`, `checkClassSubjectsNotSameDay`, etc.).
- `checkerByKind` map + `validateSchedule(...)` entry point returning full `DeterministicValidationReport`.

**Python side** (`python/validator_engine.py`):
- Parallel `_base_checks` + `_check_single` dispatch for every supported kind.
- Used inside the solver skeleton for early exit / diagnostics and for standalone verification outside the agent loop.
- `_evaluate_condition` mirrors the TS `ConditionExpr` evaluator for `if_then`.

The registry (`CHECKED_KINDS`) drives fail-closed behavior: hard constraints without a checker are reported in `hardUncheckedConstraintIds` and cause `hardCoverageComplete = false`.

## Natural Language Parsing

Two cooperating mechanisms in the Translator stage:

1. **LLM path** (only for clauses the deterministic parser cannot handle): `prompts/translator.system.md` (v3.0.0) instructs the model to emit strict `ConstraintSpec` JSON using the exact 35-kind table, `ConditionExpr` schema, `subject_consecutive` Rule A semantics, and context entity labels. Output is validated with Zod + re-sanitized.
2. **Deterministic fallback** (`fallbackFromRuleParser` + `parseConstraint` in `src/lib/constraint-parser.ts`): extensive regex + label matching for Vietnamese scheduling patterns (block day/period/slot, max consecutive, allowed days/periods, subject pinning, if-then implications, global daily limits, etc.). Many common hard constraints are fully parsed without an LLM call.

`sanitizeSpecs` performs entity validation (unknown teachers/classes/subjects/days become `custom_dsl`), auto-base tagging, weekly exact inference, room-constraint suppression, and re-invokes the fallback parser for certain edge forms that the LLM may have emitted incorrectly.

Unparseable hard constraints fall back to `custom_dsl` with diagnostic `notes` rather than being dropped.

## Key Source Files

| File | Role |
|------|------|
| `src/features/timetable/ai/constraint-spec.ts` | Core types: `ConstraintKind` (35 values), `ConstraintSpec`, `ConstraintSeverity`, `ConditionExpr`, `Violation`, `DeterministicValidationReport`. |
| `src/features/timetable/ai/constraint-registry.ts` | `CONSTRAINT_REGISTRY` (groups, `hasChecker`, required params), `CHECKED_KINDS`, `getConstraintMeta`. |
| `src/features/timetable/ai/deterministic-validator.ts` | TypeScript checker implementations + `validateSchedule` entry point + base constraint logic. |
| `python/validator_engine.py` | Python checker implementations (parallel to TS) used by solver skeleton and standalone verification. |
| `prompts/translator.system.md` | Authoritative system prompt for the LLM Translator path (ConstraintKind table, few-shot examples, Rule A, ConditionExpr). |
| `src/features/timetable/ai/translator.ts` | `runTranslatorTurn`, `fallbackFromRuleParser`, `sanitizeSpecs`, Zod schemas, weight/tag handling, LLM + deterministic merge. |
| `src/lib/constraint-parser.ts` | Low-level `parseConstraint` rule engine (many legacy patterns still exercised by fallback). |
| `src/features/timetable/ai/local-agent.ts` | Orchestration of the full pipeline; Translator → Planner → Coder → Validator → Repair call sites. |

## Related Pages

- [Translator Stage](../systems/ai-pipeline/translator.md)
- [Validator Stage](../systems/ai-pipeline/validator.md)
- [Validation System](../systems/validation.md)
- [AI Pipeline Overview](../systems/ai-pipeline/index.md)

## Notes & Known Limitations

- Room / capacity constraints are deliberately ignored at the Translator boundary (`resource_capacity` and any text matching room patterns become `custom_dsl` with `severity: "info"` and `notes: "ignored:room_constraint"`).
- `subject_group` is declarative only; no checker exists.
- `custom_dsl` with `pythonPredicate` is accepted by the type system but is never executed by the current deterministic validator (treated as unchecked).
- The "46 kinds" figure appearing in some planning documents was an aspirational target; the implemented set after `cdac5b5` is 35.

All changes to the constraint system (new kinds, checker logic, parser rules, prompt updates) are treated as first-class behavioral changes and must pass prompt validation, lint, and relevant tests before merge.
