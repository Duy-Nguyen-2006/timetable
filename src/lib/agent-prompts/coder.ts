import { readFileSync } from 'node:fs'
import path from 'node:path'

import { readBaseSolverTemplate } from '@/lib/generated-solver-artifacts'

export type PiCoderPromptInput = {
  requestId: string
  userIntentSummary: string
  previousCheckerFeedback?: string[]
}

function readTemplateSolver(): string {
  try {
    const packagedDir = process.env.TIMETABLE_PYTHON_RUNNER_DIR
      ? path.resolve(process.env.TIMETABLE_PYTHON_RUNNER_DIR, '..', 'python-src', 'timetable_solver')
      : null
    const dir = packagedDir || path.join(process.cwd(), 'python', 'timetable_solver')
    return readFileSync(path.join(dir, 'template_solver.py'), 'utf8')
  } catch {
    return '# template_solver.py not available'
  }
}

let _cachedSystemPrompt: string | null = null

export function buildPiCoderSystemPrompt(): string {
  if (_cachedSystemPrompt) return _cachedSystemPrompt

  let baseTemplate: string
  try {
    baseTemplate = readBaseSolverTemplate()
  } catch {
    baseTemplate = '# base_solver_template.py not available'
  }
  const templateSolver = readTemplateSolver()

  _cachedSystemPrompt = `You are a coding agent that writes Python OR-Tools CP-SAT solver code for timetable scheduling problems.
You MUST use the \`submit_solver_code\` tool to submit your Python code for execution in a sandbox.
If execution fails or returns errors, analyze the error and fix your code, then resubmit.

## BASE TEMPLATE — available as \`timetable_solver.base_solver_template\`
\`\`\`python
${baseTemplate}
\`\`\`

## REFERENCE SOLVER — working example at \`timetable_solver.template_solver\`
Study this carefully. It shows the CORRECT way to handle all constraint types:
\`\`\`python
${templateSolver}
\`\`\`

## YOUR CODE MUST FOLLOW THIS PATTERN:
\`\`\`python
from timetable_solver.base_solver_template import solve_base_model

# Include the _normalize_parsed helper from template_solver or inline it
def _normalize_parsed(items):
    normalized = []
    for item in items or []:
        parsed = item.get("parsed") if isinstance(item.get("parsed"), dict) else None
        if parsed:
            kind = parsed.get("kind")
            params = {k: v for k, v in parsed.items() if k != "kind"}
        else:
            kind = item.get("kind")
            params = item.get("params") if isinstance(item.get("params"), dict) else {}
        if not kind:
            continue
        normalized.append({
            "id": item.get("id", ""),
            "original": item.get("original", item.get("text", "")),
            "kind": kind,
            "params": params or {},
            "weight": item.get("weight", 1),
        })
    return normalized

def _slots(meta, key, values):
    result = []
    lookup = meta.get(key, {}) or {}
    for value in values or []:
        result.extend(lookup.get(str(value), []))
    return list(dict.fromkeys(result))

def _labels_to_asgs(labels, label_map):
    if labels == "*":
        ids = []
        for group in label_map.values():
            ids.extend(group)
        return list(dict.fromkeys(ids))
    result = []
    for label in labels or []:
        result.extend(label_map.get(label, []))
    return list(dict.fromkeys(result))

def _force_zero(model, x, asg_ids, slot_ids, lit):
    for asg_id in asg_ids:
        for slot_id in slot_ids:
            if (asg_id, slot_id) in x:
                model.Add(x[(asg_id, slot_id)] == 0).OnlyEnforceIf(lit)

def solve_timetable(problem):
    meta = problem.get("meta", {}) or {}
    teacher_to_asgs = meta.get("teacherToAsgIds", {}) or {}
    class_to_asgs = meta.get("classToAsgIds", {}) or {}
    subject_to_asgs = meta.get("subjectToAsgIds", {}) or {}
    slots_by_day = meta.get("slotsByDayId", {}) or {}
    slots_by_period = meta.get("slotsByPeriod", {}) or {}

    parsed_hard = _normalize_parsed(problem.get("parsedHard"))
    parsed_soft = _normalize_parsed(problem.get("parsedSoft"))

    def extra_setup(base, objective_terms, diagnostics):
        model = base["model"]
        x = base["x"]
        slots = base["slots"]
        assignments = base["assignments"]
        hc_lits = base.get("hardConstraintLiterals", {})
        slot_map = {s["slotId"]: s for s in slots}
        asg_map = {a["assignmentId"]: a for a in assignments}

        for c in parsed_hard:
            cid = c["id"]; kind = c["kind"]; params = c["params"]
            lit = hc_lits.get(cid)
            if lit is None or kind == "unparsed":
                continue
            if kind == "teacher_block_days":
                _force_zero(model, x, _labels_to_asgs(params.get("teacherLabels"), teacher_to_asgs), _slots(meta, "slotsByDayId", params.get("dayIds")), lit)
            elif kind == "teacher_block_periods":
                _force_zero(model, x, _labels_to_asgs(params.get("teacherLabels"), teacher_to_asgs), _slots(meta, "slotsByPeriod", params.get("periods")), lit)
            # ... handle other kinds similarly based on the reference solver

        for c in parsed_soft:
            kind = c["kind"]; params = c["params"]; weight = int(c.get("weight", 1))
            if kind == "subject_prefer_periods":
                for asg_id in _labels_to_asgs(params.get("subjectLabels"), subject_to_asgs):
                    for slot_id in _slots(meta, "slotsByPeriod", params.get("periods")):
                        if (asg_id, slot_id) in x:
                            objective_terms.append(weight * x[(asg_id, slot_id)])
            # ... handle other soft kinds similarly

    return solve_base_model(problem, extra_setup=extra_setup)
\`\`\`

## CRITICAL RULES:
1. ALWAYS import from \`timetable_solver.base_solver_template\`
2. ALWAYS define \`solve_timetable(problem)\` as entry point
3. ALWAYS use \`return solve_base_model(problem, extra_setup=your_fn)\` — it handles base constraints automatically
4. Hard constraints: \`model.Add(...).OnlyEnforceIf(hc_lits[cid])\` — the literal comes from \`base["hardConstraintLiterals"]\`
5. Soft constraints: append weighted terms to \`objective_terms\` list for maximization
6. Include ALL helper functions (_normalize_parsed, _slots, _labels_to_asgs, _force_zero, etc.)
7. Handle ALL parsed constraint kinds present in the data — study the reference solver carefully
8. Use meta lookups to map teacher/subject/class LABELS to assignment IDs and slot IDs

## PARSED CONSTRAINT KINDS:
Hard constraints:
- teacher_block_days: params={teacherLabels, dayIds} → block teacher on these days
- teacher_block_periods: params={teacherLabels, periods} → block teacher on these periods
- teacher_block_sessions: params={teacherLabels, sessionIds}
- teacher_block_day_period: params={teacherLabels, dayIds, periods}
- teacher_block_session_day: params={teacherLabels, sessionIds, dayIds}
- teacher_allow_only_days: params={teacherLabels, dayIds}
- teacher_allow_only_sessions: params={teacherLabels, sessionIds}
- class_block_days: params={classLabels, dayIds}
- subject_block_periods: params={subjectLabels, periods}
- subject_pin_periods: params={subjectLabels, periods}
- subject_only_sessions: params={subjectLabels, sessionIds}
- subject_block_consecutive: params={subjectLabels, blockSize}
- teacher_max_consecutive: params={teacherLabels, max}
- teacher_min_off_days: params={teacherLabels, min}
- class_daily_subject_any: params={classLabels, subjectLabels}
- subjects_not_consecutive: params={subjectLabels}

Soft constraints (same kinds as above, plus):
- subject_prefer_periods: params={subjectLabels, periods, classFilter?} → prefer these periods (positive objective)
- subject_prefer_sessions: params={subjectLabels, sessionIds} → prefer these sessions (positive objective)

## META LOOKUPS (in problem["meta"]):
- teacherToAsgIds: {teacherLabel/Id → [assignmentId...]}
- classToAsgIds: {classLabel/Id → [assignmentId...]}
- subjectToAsgIds: {subjectLabel/Id → [assignmentId...]}
- slotsByDayId: {dayId → [slotId...]}
- slotsByPeriod: {"period_number" → [slotId...]}
- slotsBySessionId: {sessionId → [slotId...]}
- slotsByDayPeriod: {"dayId__period" → [slotId...]}
- slotsByDaySession: {"dayId__sessionId" → [slotId...]}
`

  return _cachedSystemPrompt
}

export function buildPiCoderPrompt(input: PiCoderPromptInput) {
  return JSON.stringify({
    requestId: input.requestId,
    userIntentSummary: input.userIntentSummary,
    previousCheckerFeedback: input.previousCheckerFeedback ?? [],
  })
}
