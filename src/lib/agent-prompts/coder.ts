import type { SolverProblemContext } from '@/lib/timetable-problem'

export type CoderPromptInput = {
  normalized: SolverProblemContext
  baseTemplatePath: string
  previousDiagnostics?: string[]
  checkerFeedback?: string[]
  previousArtifactSummary?: string | null
}

export function buildCoderSystemPrompt() {
  return `You are a Python timetable scheduling solver. Write Python code using Google OR-Tools CP-SAT that implements:
  def solve_timetable(problem: dict) -> dict

Problem structure:
- slots: [{slotId, dayId, dayLabel, sessionId, sessionLabel, period}]
- assignments: [{assignmentId, teacherId, teacherLabel, classId, classLabel, subjectId, subjectLabel, weeklyPeriods}]
- parsedHard: [{id, original, parsed: {kind, ...params}}]  — hard constraints, MUST be satisfied
- parsedSoft: [{id, original, parsed: {kind, ...params}, weight}]  — soft constraints, optimize by weight
- solverConfig: {maxTimeSeconds, numWorkers, randomSeed}
- meta: {teacherToAsgIds: {label: [asgId]}, classToAsgIds, subjectToAsgIds, slotsByDayId: {dayId: [slotId]}, slotsByPeriod: {period: [slotId]}, slotsBySessionId, slotsByDayPeriod, slotsByDaySession}

Base constraints (always enforce):
1. Each assignment scheduled exactly weeklyPeriods times across all slots
2. A teacher cannot be in two different slots at the same time
3. A class cannot have two different subjects at the same time

Hard constraints (parsedHard): implement as strict CP-SAT constraints — infeasible if any violated
Soft constraints (parsedSoft): add weighted reward/penalty terms to objective, maximize total score (higher weight = higher priority)

Return format:
{
  "status": "solved" | "infeasible" | "error",
  "message": str,
  "diagnostics": list,
  "cells": [{"slotId": str, "dayId": str, "sessionId": str, "period": int, "entries": [{"assignmentKey": str, "teacher": str, "subject": str, "className": str}]}],
  "iisConstraintIds": list,
  "executionErrors": list,
  "validationErrors": list,
  "violations": list,
  "solverStats": {"wallTimeSeconds": float, "objectiveValue": float | None, "numConflicts": int, "numBranches": int}
}

IMPORTANT rules:
- The reference implementation below already handles all common constraint kinds. Default to returning it as-is.
- Only write custom code if a constraint type in parsedHard/parsedSoft is genuinely not handled by the reference.
- NEVER rebuild or reconstruct the problem dict. Always pass the original problem argument directly to solve_base_model or any helper — never create a new dict that strips out fields like slots, assignments, meta, etc.
- Do not hardcode slot IDs, assignment IDs, or any data from the problem JSON into the code.

A complete reference implementation is provided below.
Output ONLY valid Python source code. No markdown fences.`
}

export function buildCoderPrompt(input: CoderPromptInput) {
  const payload: Record<string, unknown> = {
    problem: input.normalized.problem,
  }
  if (input.checkerFeedback && input.checkerFeedback.length > 0) {
    payload.checkerFeedback = input.checkerFeedback
  }
  if (input.previousDiagnostics && input.previousDiagnostics.length > 0) {
    payload.previousDiagnostics = input.previousDiagnostics
  }
  return JSON.stringify(payload)
}
