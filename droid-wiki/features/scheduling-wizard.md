# Scheduling Wizard

Active contributors: Duy

## Purpose

The Scheduling Wizard is the primary interactive user interface of Tack Timetable. After the May 2026 component extraction refactor, it is implemented as an orchestrator component (`src/features/timetable/TimetableApp.tsx`, reduced from ~118 kLOC to ~3 kLOC core logic) that delegates individual wizard pages to focused components under `components/`. It guides the user through the full workflow: selecting teaching days and sessions, configuring maximum periods, previewing and pruning the timetable grid, entering teachers/subjects/classes, defining assignments, specifying natural-language constraints (required/preferred), invoking the Local Agent AI pipeline, reviewing deterministic validation results and violations, and exporting the final timetable plus diagnostics to Excel.

The wizard is the sole driver of the entire end-user experience and orchestrates the 6-stage Local Agent pipeline.

## Directory layout

Relevant files under `src/features/timetable/` (the feature directory for the interactive scheduling canvas). After the May 2026 refactor, page-level UI logic has been extracted from the monolithic orchestrator into focused components:

- `TimetableApp.tsx` — The orchestrator component (~3 kLOC after extraction). Manages global wizard state, agent integration, caching, and Excel export; delegates page rendering to components/.
- `components/`
  - `PreviewPage.tsx` — Live timetable grid preview with per-cell delete/restore (period pruning UI).
  - `SetupPages.tsx` — Early wizard pages: SelectPage (days/sessions), PeriodsPage, DetailsPage, SubjectsPage, ClassesPage, etc.
  - `TimetableFields.tsx` — Reusable field components: DayTile, SessionTile, PeriodControl, MetricCard, SelectField.
- `assignment-helpers.tsx` — Assignment-related helpers extracted during the refactor.
- `cache.ts` — Wizard result caching utilities.
- `solver-ui.ts` — UI formatting helpers for solver/agent results.
- `types.ts` — UI-specific TypeScript types for the wizard.
- `quick-import.ts` — Parser for the "Nhập dữ liệu nhanh" (quick import) text dataset format.
- `quick-import.test.ts` — Unit tests for the quick-import parser.
- `SettingsModal.tsx` — AI provider configuration modal (base URL, API key, model, solver profile).
- `constants.ts` — Shared UI constants: days, sessions, default periods, constraint type metadata, styling classes.
- `utils.ts` — Helpers: `getCellKey`, `makeAssignmentKey`, `normalizeSubjectName`, `normalizeAssignments`, `sortAlphabetically`.
- `ai/` — Local Agent pipeline implementation (see cross-links below).

## Key abstractions

- `TimetableAppProps`: `{ onBackToLanding?: () => void; quickDatasetText?: string | null }`
- Internal React state (`useState`, managed in the orchestrator `TimetableApp.tsx`):
  - Wizard navigation: `page` (`'select' | 'periods' | 'final' | 'details' | 'subjects' | 'classes' | 'assignments' | 'constraints' | 'summary'`)
  - Structure: `selectedDays`, `selectedSessions`, `periods: Record<'morning'|'afternoon'|'night', number>`, `deletedPeriods`
  - Master data: `teacherList`, `subjectList`, `classList`
  - `assignmentList: AssignmentItem[]` (each with `key`, `teacher`, `subject`, `className`, `weeklyPeriods`)
  - `constraintList: ConstraintItem[]` (each with `id`, `type: 'required'|'preferred'`, `text`, optional `weight`)
  - AI/runtime: `aiResult: TimetableSolveResult | null`, `aiLoading`, `aiError`, `agentStatus`, `agentStep: AgentProgressStep`, `agentTimeline: AgentLifecycleEvent[]`, `aiProvider: AIProviderConfig | null`
- Types imported from `./ai/types` and `./types` (post-refactor):
  - `AIProviderConfig`, `AgentInputPayload`, `AgentLifecycleEvent`, `AgentLifecyclePhase`, `LocalAgentFinalResult`
- `ConstraintItem` distinguishes hard (`required`) vs soft (`preferred` with weight) constraints.
- Quick-import result shape: `QuickImportData` (from `quick-import.ts`).

## How it works

### User flow (Mermaid)

```mermaid
flowchart TD
  Landing[Landing page.tsx] -->|Bắt đầu nhập dữ liệu| Wizard[TimetableApp]
  Wizard --> Select[Select days & sessions]
  Select --> Periods[Configure max periods per session]
  Periods --> Final[Live grid preview – click to delete/restore periods]
  Final --> Teachers[Enter teachers]
  Teachers --> Subjects[Enter subjects + presets]
  Subjects --> Classes[Enter classes + preset groups]
  Classes --> Assignments[Assignments: Teacher-Subject-Class-WeeklyPeriods]
  Assignments --> Constraints[Constraints: required (hard) or preferred (soft with weight)]
  Constraints --> Summary[Summary view + AI Provider status]
  Summary -->|Xếp lịch| HandleGenerate[handleGenerate]
  HandleGenerate --> BuildPayload[Build AgentInputPayload + constraint confirmations]
  BuildPayload -->|if cached| CacheHit[Return cached result]
  BuildPayload -->|else| RunAgent[runLocalAgent with onEvent callback]
  RunAgent -->|AgentLifecycleEvent| UIUpdate[Update agentStep, timeline, status]
  RunAgent -->|finalResult| RenderResult[Render timetable, violations, diagnostics]
  RenderResult --> Excel[handleDownloadExcel → multi-sheet .xlsx]
```

### Key behaviors

- **Quick import**: A `useEffect` watches the `quickDatasetText` prop. On change it calls `parseQuickImportText`, populates all master lists, assignments, and constraints (hard → `required`, soft → `preferred` with default weight 5), resets AI state, and navigates to the first page.
- **Period pruning**: Users can delete individual period cells in the preview grid; `deletedPeriods` map drives visibility in the final timetable and solver input.
- **Assignment validation**: Before leaving the assignments page, `validateAssignmentsBeforeNext` enforces referential integrity (teachers/subjects/classes must exist) and that total assigned periods match required class periods.
- **Constraint confirmation**: On solve, a confirm dialog shows how each constraint will be interpreted (`[required]` or `[preferred:weight]`).
- **Agent progress mapping**: `toProgressStep` converts `AgentLifecyclePhase` values (translator/planner/thinking/coding/running/checking/fixing) into the five UI steps shown in the progress bar.
- **Caching**: Successful runs are cached in localStorage (keyed by input digest, max 3 entries) for instant replay of identical inputs.
- **Result rendering**: `solvedCellMap` normalizes both direct `cells` and legacy `schedule` row formats into a slotId → entries map used by the result table.
- **Excel export** (`handleDownloadExcel`): Produces four sheets — timetable, Checker report, Validation report, and Diagnostics (including attempt history).

## Integration points

The wizard is the exclusive caller of the Local Agent from the user interface:

- **Core call site**: `handleGenerate` (inside `TimetableApp.tsx`) builds `AgentInputPayload` and invokes:
  ```ts
  const agentResult = await runLocalAgent(agentInput, {
    ...aiProvider,
    onEvent: (event) => { /* map to setAgentStatus / setAgentStep / pushTimelineEvent */ }
  })
  ```
- **Provider configuration**: Persisted in localStorage under `tack_ai_provider_config`. First-run flow forces the `SettingsModal`.
- **Dependencies**:
  - `parseQuickImportText` from `./quick-import`
  - Normalization helpers from `./utils`
  - `normalizeAssignments`
  - `xlsx` for Excel generation
- **Downstream pipeline** (see `systems/ai-pipeline/index.md`): `runLocalAgent` → Translator → Planner → Coder → Sandbox execution → Validator → Repair loop.
- **Constraint semantics**: Hard vs soft handling and weight interpretation are defined in `features/constraint-system.md`.

## Entry points for modification

- **Add or reorder wizard pages**: Extend the `page` state union and add a new conditional render branch + nav buttons.
- **Extend quick-import format**: Modify `parseQuickImportText` in `quick-import.ts` and update `quick-import.test.ts`.
- **Change agent progress UI mapping**: Edit `toProgressStep` and the `onEvent` handler inside `handleGenerate`.
- **Customize result table or Excel layout**: Modify `solvedCellMap`, `fixedResultTableSections`, `buildReportRows`, and `handleDownloadExcel`.
- **Provider / solver profile UI**: Edit `SettingsModal.tsx` (test button calls `/api/provider/test`).
- **Styling constants or constraint type metadata**: `constants.ts`.

## Key source files

| File | Role |
|------|------|
| `src/app/page.tsx` | Landing page with entry points to the wizard and the quick-import textarea |
| `src/features/timetable/TimetableApp.tsx` | The complete interactive scheduling canvas and AI orchestration (~3k LOC) |
| `src/features/timetable/quick-import.ts` | Parser for the "Nhập dữ liệu nhanh" text format + sample dataset constant |
| `src/features/timetable/quick-import.test.ts` | Unit tests exercising day/session parsing, period distribution, and error cases |
| `src/features/timetable/SettingsModal.tsx` | AI provider configuration UI (base URL, key, model, solver profile, connectivity test) |
| `src/features/timetable/constants.ts` | Days, sessions, default periods, constraint type definitions, shared Tailwind classes |
| `src/features/timetable/utils.ts` | Cell/assignment key helpers and normalization functions used throughout the wizard |
| `src/features/timetable/ai/local-agent.ts` | The 6-stage pipeline entry point called by `handleGenerate` (see `systems/ai-pipeline/index.md`) |
| `src/features/timetable/ai/types.ts` | Shared TypeScript types for agent payloads, events, and results |

## Related pages

- `features/constraint-system.md` — The 46 `ConstraintKind` values, severity rules, and how natural-language constraints become structured specs.
- `systems/ai-pipeline/index.md` — Detailed breakdown of the Translator → Planner → Coder → Sandbox → Validator → Repair pipeline that the wizard drives.
- `overview/getting-started.md` — How to run the dev server, first-run provider setup, and prerequisites.
