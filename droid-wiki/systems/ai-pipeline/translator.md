# Translator Stage

Active contributors: Duy

## Purpose

The Translator is the first stage of the Local Agent. Its sole job is to read raw natural-language constraint text (in Vietnamese, for this domain) together with the current dataset (teachers, classes, subjects, days, periods) and emit a list of structured `ConstraintSpec` objects, each using one of the 46 known `ConstraintKind` values.

It is deliberately hybrid:
- Fast, deterministic fallback parser rules handle the common, unambiguous cases without calling an LLM at all.
- The language model is only invoked for the remaining ambiguous or complex constraints.
- If the LLM call fails or returns invalid output, the stage falls back entirely to the deterministic parser.

This design minimizes latency, token cost, and nondeterminism while still supporting rich, free-form input.

## Location and entry point

- Main implementation: `src/features/timetable/ai/translator.ts`
- Exported function: `runTranslatorTurn(config, input, invokeChat?)`
- Internal test surface: `__translatorInternal` (contains `fallbackFromRuleParser`, `sanitizeSpecs`, period builders, etc.)
- Prompt: `prompts/translator.system.md` (synced to `public/prompts/translator.system.md` at build/dev time)

## Input

`AgentInputPayload` (see `types.ts`):

- `days`, `sessions`, `periodCounts`, `deletedPeriods`
- `assignments`: array of `{ id, teacher, subject, class, weeklyPeriods }`
- `constraints`: array of `{ type: 'required' | 'preferred', text: string, weight? }`
- Optional `metadata`

The Translator also builds a compact `context` object containing unique teacher/class/subject labels and the active period numbers per day (respecting deletions and session structure).

## Output

`TranslatorTurnResult`:

```ts
{
  constraintSpecs: ConstraintSpec[],
  rawResponse?: string,
  usageTokens?: number
}
```

Each `ConstraintSpec` has:
- `id` (stable identifier like `c1`, `c2`)
- `original` (exact copy of the user's text)
- `severity` (`hard` / `soft` / `info`)
- `kind` (one of 46 `ConstraintKind` values)
- `params` (kind-specific)
- Optional `weight`, `tags`, `notes`

## Deterministic fallback parser (the fast path)

The function `fallbackFromRuleParser` (and its helpers) runs first, before any LLM call.

It recognizes a large set of common Vietnamese scheduling phrases using:

- Label matching (teacher names, class names, subject names, day labels/ids)
- Keyword patterns (`không dạy`, `tối đa`, `liên tiếp`, `nên`, `bắt buộc`, etc.)
- Number extraction (with special handling for "tiết N" to avoid confusing day numbers with period numbers — see `extractPeriodNumber`)
- Heuristics for auto-base constraints (`weekly_periods_exact` for every assignment)

Constraints that parse cleanly to a non-`custom_dsl` kind are removed from the LLM prompt entirely. Only the remaining ambiguous text is sent to the model.

If the LLM call later fails or returns nothing usable, the entire input falls back to this deterministic result.

## LLM path (when needed)

When unparsed constraints remain:

1. The current system prompt is fetched from `/prompts/translator.system.md`.
2. A compact context (teachers, classes, subjects, days, periods, periodsByDay) plus the remaining raw constraints is sent.
3. The model is asked to return strict JSON matching the `translatorResponseSchema`.
4. The response is validated with Zod.
5. Successful specs are merged with the deterministic results (deduplication happens later in the orchestrator).
6. `sanitizeSpecs` is called to:
   - Ensure all referenced entities (teacher, subject, class, assignmentId) actually exist in the current dataset.
   - Drop or mark-invalid specs that reference unknown names.
   - Automatically tag `weekly_periods_exact` specs that exactly match an assignment's declared weekly load as `auto_base`.

If the LLM call throws or the parsed JSON fails schema validation, the function returns only the deterministic fallback (with empty `rawResponse`).

## The 46 ConstraintKind values

As of the `cdac5b5` commit, the complete set (defined in `constraint-spec.ts` and mirrored in the translator schema and prompt) is:

Teacher constraints:
- `teacher_block_day`, `teacher_block_period`, `teacher_block_slot`
- `teacher_max_per_day`, `teacher_max_consecutive`, `teacher_max_working_days`
- `teacher_min_per_day`, `teacher_no_gaps`
- `teacher_allowed_days`, `teacher_allowed_periods`

Subject constraints:
- `subject_pin_period`, `subject_consecutive`, `subject_max_consecutive`
- `subject_allowed_days`, `subject_min_gap_days`, `subject_daily_max_periods`

Class constraints:
- `class_block_day`, `class_block_period`, `class_block_slot`
- `class_max_per_day`, `class_min_per_day`, `class_no_gaps`
- `class_no_double_subject_day`, `class_subjects_not_same_day`

Assignment constraints:
- `assignment_pin_slot`, `assignment_block_slot`, `assignment_allowed_slots`
- `assignment_spread_days`, `weekly_periods_exact`

Conditional and grouping:
- `if_then`, `pair_not_same_slot`
- `resource_capacity`, `session_limit`
- `subject_group`, `subject_group_daily_limit`

Escape hatch:
- `custom_dsl` — the model is allowed to emit a `pythonPredicate` string that will be executed later (with AST checks when used as hard).

The translator prompt (`prompts/translator.system.md`) contains the authoritative table of when to use each kind and which params are required.

## Key implementation details

- **Vietnamese normalization**: `normalizeConstraintText` lowercases, strips diacritics, normalizes "đ"→"d", and collapses whitespace. Used for robust keyword matching.
- **Day id canonicalization**: Accepts both ids (`mon`, `tue`...) and labels (`Thứ 2`, `Thứ 3`...), plus common abbreviations (`thứ 2`, `thu 2`, `cn`, etc.).
- **Period extraction safety**: `extractPeriodNumber` looks specifically for "tiết N" / "tiet N" / "period N" patterns so that "thứ 6 tiết 5" does not mistakenly treat the day number as a period.
- **Auto-base tagging**: `shouldMarkWeeklyAutoBase` detects when a `weekly_periods_exact` constraint exactly restates an assignment's declared weekly load; these are later filtered out before being sent to the solver (they are already implicit).
- **Sanitization**: `sanitizeSpecs` is the last guard before specs leave the translator. It drops references to entities that no longer exist in the current UI state.

## Error handling and resilience

- LLM failure → silent fallback to deterministic parser (the user still gets *something* rather than a hard error).
- Invalid JSON from model → same fallback.
- Entity references that no longer exist in the dataset → dropped or marked during sanitization.
- Empty result after all filtering → the orchestrator will later report a clear "no executable constraints" situation rather than crashing.

## Testing

- `src/features/timetable/ai/translator.test.ts` exercises the internal helpers (`__translatorInternal`).
- Prompt behavior is validated by `npm run test:prompt` (which runs `scripts/validate_coder_prompt_models.ts` against the current prompt + model combination).
- The translator is also exercised indirectly by the broader `local-agent.test.ts` integration scenarios.

## Related pages

- [AI Pipeline index](index.md) — the six-stage overview and orchestration
- [Constraint System](../../../features/constraint-system.md) — semantics of all 46 kinds
- [Planner](planner.md) — the next consumer of the `ConstraintSpec[]` list
- [Validation Stage](validator.md) — where these specs are later checked against a concrete schedule
- [Translator prompt](../../../../prompts/translator.system.md) — the actual instructions given to the model (source of truth)

## Where to start if you need to change translation behavior

1. Run `gitnexus_impact` on the symbols you plan to touch.
2. If you are adding a new `ConstraintKind`, first add it to:
   - `src/features/timetable/ai/constraint-spec.ts`
   - the Zod schema inside `translator.ts`
   - the JSON schema in the chat payload
   - the table in `prompts/translator.system.md`
3. Add the corresponding deterministic parsing rule (or decide it must always go through the LLM).
4. Add the Python and TypeScript checkers (see [Validation System](../../validation.md)).
5. Update or add translator unit tests and run `npm run test:prompt`.
6. Verify that `sanitizeSpecs` correctly handles the new kind's entity references.
