import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import ZAI from "z-ai-web-dev-sdk";

// ─── Python path resolver (bundled or system) ──────────────
function getPythonPath(): string {
  // 1. Check for bundled Python next to the app
  try {
    const __filename = fileURLToPath(import.meta.url);
    // route.ts is at .next/standalone/src/app/api/timetable/solve/route.js
    // App root is 6 levels up from route.js
    const appRoot = dirname(dirname(dirname(dirname(dirname(dirname(__filename))))));

    if (process.platform === "win32") {
      const bundledWin = join(appRoot, "python", "python.exe");
      if (existsSync(bundledWin)) return bundledWin;
    } else {
      const bundledLinux = join(appRoot, "python", "bin", "python3");
      if (existsSync(bundledLinux)) return bundledLinux;
    }
  } catch {
    // Ignore path resolution errors
  }

  // 2. Check environment variable
  const envPython = process.env.TACK_PYTHON_PATH;
  if (envPython && existsSync(envPython)) return envPython;

  // 3. Fall back to system Python
  return process.platform === "win32" ? "python" : "python3";
}

const pythonPath = getPythonPath();

// ─── Types ───────────────────────────────────────────────────
type InputAssignment = {
  teacher: string;
  subject: string;
  className: string;
  weeklyPeriods: string;
};

type InputConstraint = {
  type: "required" | "preferred";
  text: string;
};

type SolveCell = {
  slotId: string;
  dayId: string;
  sessionId: string;
  period: number;
  entries: {
    assignmentKey: string;
    subject: string;
    teacher: string;
    className: string;
  }[];
};

type VerificationCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

type VerificationResult = {
  passed: boolean;
  checks: VerificationCheck[];
  hardViolations: { constraint: string; detail: string }[];
  softViolations: { constraint: string; detail: string }[];
};

type InfeasibilityAnalysis = {
  conflicts: string[];
  suggestions: string[];
};

type TimetableResult = {
  status: "solved" | "infeasible" | "error";
  message: string;
  cells: SolveCell[];
  verification: VerificationResult | null;
  generatedCode: string | null;
  aiReport: string | null;
  infeasibilityAnalysis: InfeasibilityAnalysis | null;
};

const MAX_CODE_RETRIES = 2;
const SOLVER_TIMEOUT_MS = 60000;

// ─── Step 1: Build problem description for AI ────────────────
function buildProblemDescription(input: {
  selectedDays: string[];
  selectedSessions: string[];
  periodsPerSession: Record<string, number>;
  disabledSlots: string[];
  teachers: string[];
  subjects: string[];
  classes: string[];
  assignments: InputAssignment[];
  constraints: InputConstraint[];
}) {
  const dayLabels: Record<string, string> = {
    mon: "Thứ 2", tue: "Thứ 3", wed: "Thứ 4",
    thu: "Thứ 5", fri: "Thứ 6", sat: "Thứ 7", sun: "Chủ nhật",
  };
  const sessionLabels: Record<string, string> = {
    morning: "Sáng", afternoon: "Chiều", evening: "Tối",
  };

  const slots: {
    slotId: string; dayId: string; dayLabel: string;
    sessionId: string; sessionLabel: string; period: number;
  }[] = [];

  for (const dayId of input.selectedDays) {
    for (const sessionId of input.selectedSessions) {
      const maxP = input.periodsPerSession[sessionId] || 0;
      for (let p = 1; p <= maxP; p++) {
        const slotId = `${dayId}-${sessionId}-${p}`;
        if (!input.disabledSlots.includes(slotId)) {
          slots.push({
            slotId, dayId,
            dayLabel: dayLabels[dayId] || dayId,
            sessionId,
            sessionLabel: sessionLabels[sessionId] || sessionId,
            period: p,
          });
        }
      }
    }
  }

  return {
    slots,
    assignments: input.assignments,
    constraints: input.constraints,
    teachers: input.teachers,
    subjects: input.subjects,
    classes: input.classes,
    totalSlotsAvailable: slots.length,
    totalPeriodsNeeded: input.assignments.reduce(
      (sum, a) => sum + parseInt(a.weeklyPeriods, 10), 0
    ),
  };
}

// ─── Step 2: AI defines the problem (constraint analysis) ───
async function aiDefineProblem(
  problem: ReturnType<typeof buildProblemDescription>
): Promise<string> {
  const zai = await ZAI.create();

  const systemPrompt = `You are an expert scheduling problem analyst. Given a school timetable scheduling problem, your job is to ANALYZE and DEFINE the problem structure — NOT solve it.

Analyze the constraints and describe:
1. What types of constraints exist (identify them freely — do NOT use a fixed list)
2. Which entities (teachers, classes, subjects, slots) each constraint involves
3. How each constraint should be modeled (hard constraint = model.Add, soft constraint = add to objective)
4. Any potential conflicts between constraints
5. Whether the problem appears feasible given the slot count vs. periods needed

Be thorough. Identify constraint patterns from the natural language text. You have complete freedom to define constraint types — there is no fixed template.

Common patterns you might encounter (but you are NOT limited to these):
- Teacher unavailability (specific time/day/session)
- Subject preferred time slots
- Max periods per teacher per day
- No double-booking for teacher or class
- Subject spacing (don't put same subject consecutively)
- Min/max periods for a class per day
- Teacher preferences for specific days
- Room/resource constraints
- Any other pattern the user describes

Return your analysis as clear, structured text in Vietnamese.`;

  const userPrompt = `Phân tích bài toán xếp thời khóa biểu sau:

Số slot khả dụng: ${problem.totalSlotsAvailable}
Tổng tiết cần xếp: ${problem.totalPeriodsNeeded}
Giáo viên: ${problem.teachers.join(", ")}
Lớp: ${problem.classes.join(", ")}
Môn: ${problem.subjects.join(", ")}

Phân công:
${JSON.stringify(problem.assignments, null, 2)}

Ràng buộc:
${JSON.stringify(problem.constraints, null, 2)}

Slot khả dụng:
${JSON.stringify(problem.slots, null, 2)}

Hãy phân tích và định nghĩa bài toán.`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    thinking: { type: "disabled" },
  });

  return completion.choices[0]?.message?.content || "";
}

// ─── Step 3: AI generates OR-Tools Python code ───────────────
async function generateOrtoolsCode(
  problem: ReturnType<typeof buildProblemDescription>,
  problemAnalysis: string,
  previousError?: string,
  previousCode?: string
): Promise<string> {
  const zai = await ZAI.create();

  const systemPrompt = `You are an expert OR-Tools CP-SAT constraint programming engineer specializing in school timetable scheduling.

Your task: Given a scheduling problem description AND a detailed problem analysis, write a COMPLETE, SELF-CONTAINED Python script that:
1. Reads the problem JSON from stdin
2. Builds a CP-SAT model with boolean decision variables x[assignment_id, slot_id]
3. Adds ALL necessary constraints including:
   - Each assignment must have exactly its required number of weekly periods
   - No teacher teaches two different classes at the same time slot
   - No class has two different subjects at the same time slot
   - ALL user-defined constraints — dynamically interpret each one from its text
4. For hard constraints (type="required"): use model.Add() — these MUST be satisfied
5. For soft constraints (type="preferred"): add to objective function with weighted penalties
6. Solves the model and outputs JSON to stdout with this EXACT format:
   {"status": "solved"|"infeasible"|"error", "message": "...", "cells": [{"slotId":"...", "dayId":"...", "sessionId":"...", "period": N, "entries": [{"assignmentKey":"...", "subject":"...", "teacher":"...", "className":"..."}]}]}

CRITICAL RULES:
- You must dynamically interpret EACH constraint text and write appropriate OR-Tools code for it
- Do NOT hardcode constraint types — read each constraint.text, understand it naturally, and write code
- The problem analysis below tells you what constraint types were identified — USE IT to guide your code
- For infeasible results, also include: "infeasibilityHints": ["hint1", "hint2"]
- The assignment key format is: "teacher|subject|className|weeklyPeriods"
- Output ONLY valid JSON to stdout, nothing else — no debug prints, no warnings
- Use json.dumps(result, ensure_ascii=False) for output
- Set solver parameters: max_time_in_seconds=60, num_workers=4
- Import only: json, sys, and from ortools.sat.python.cp_model import CpModel, CpSolver
- The script MUST be complete and runnable as-is
- Wrap all output in try/except to ensure JSON is always output even on errors
- DO NOT use any print() statements except the final JSON output`;

  let userPrompt = `Here is the scheduling problem:

${JSON.stringify(problem, null, 2)}

Problem Analysis:
${problemAnalysis}

Write the complete Python OR-Tools CP-SAT solver script. Remember:
- Dynamically interpret each constraint.text based on the problem analysis
- Hard constraints (type="required") MUST be satisfied (use model.Add)
- Soft constraints (type="preferred") should be optimized (add to objective with weighted penalties)
- Output ONLY the Python code, no markdown, no explanation`;

  if (previousError && previousCode) {
    userPrompt = `The previous Python code you generated had an execution error. Fix it.

PREVIOUS CODE:
${previousCode}

ERROR:
${previousError}

PROBLEM DATA (for reference):
${JSON.stringify(problem, null, 2)}

PROBLEM ANALYSIS (for reference):
${problemAnalysis}

Fix the code and output ONLY the corrected Python script. No markdown, no explanation.`;
  }

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    thinking: { type: "disabled" },
  });

  let code = completion.choices[0]?.message?.content || "";

  // Extract code from markdown if wrapped
  const codeBlockMatch = code.match(/```(?:python)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    code = codeBlockMatch[1].trim();
  }

  // Remove any leading non-code text (before first import or comment)
  const firstImportIdx = code.search(/^(import |from |#|""")/m);
  if (firstImportIdx > 0) {
    code = code.substring(firstImportIdx);
  }

  return code;
}

// ─── Step 4: Execute Python code with retry ─────────────────
function executePythonCode(
  code: string,
  problemJson: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const workDir = join(tmpdir(), `tack-solve-${Date.now()}`);
    mkdirSync(workDir, { recursive: true });

    const scriptPath = join(workDir, "solver.py");
    writeFileSync(scriptPath, code, "utf-8");

    const child = spawn(pythonPath, ["-u", scriptPath], {
      cwd: workDir,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: SOLVER_TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: Error) => {
      cleanup(workDir);
      resolve({ stdout: "", stderr: error.message, exitCode: -1 });
    });

    child.on("close", (code: number | null) => {
      cleanup(workDir);
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });

    child.stdin.write(problemJson);
    child.stdin.end();
  });
}

function cleanup(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ─── Step 5: AI verifies the result ──────────────────────────
async function verifyResult(
  problem: ReturnType<typeof buildProblemDescription>,
  result: { status: string; cells: SolveCell[]; message: string }
): Promise<VerificationResult> {
  const zai = await ZAI.create();

  const systemPrompt = `You are a timetable verification expert. Given the original scheduling problem and the solver's result, verify that ALL constraints are satisfied.

Check the following:
1. Each assignment has exactly the required number of weekly periods
2. No teacher teaches two classes at the same slot
3. No class has two subjects at the same slot
4. All hard (required) constraints are satisfied
5. Report soft constraint satisfaction status

Return a JSON object with this exact schema:
{
  "passed": boolean,
  "checks": [{"name": "check name", "passed": boolean, "detail": "explanation"}],
  "hardViolations": [{"constraint": "constraint text", "detail": "violation detail"}],
  "softViolations": [{"constraint": "constraint text", "detail": "violation detail"}]
}

Be thorough. Check EACH constraint text against the actual schedule. Return ONLY valid JSON.`;

  const userPrompt = `Original problem constraints:
${JSON.stringify(problem.constraints, null, 2)}

Assignments (required periods):
${JSON.stringify(problem.assignments.map(a => ({
  assignment: `${a.teacher} - ${a.subject} - ${a.className}`,
  requiredPeriods: parseInt(a.weeklyPeriods, 10)
})), null, 2)}

Available slots: ${problem.slots.length}

Solver result cells:
${JSON.stringify(result.cells, null, 2)}

Verify the result and return the JSON verification report.`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    thinking: { type: "disabled" },
  });

  const text = completion.choices[0]?.message?.content || "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as VerificationResult;
      // Validate structure
      if (
        typeof parsed.passed === "boolean" &&
        Array.isArray(parsed.checks) &&
        Array.isArray(parsed.hardViolations) &&
        Array.isArray(parsed.softViolations)
      ) {
        return parsed;
      }
    }
  } catch {
    // Fallback to programmatic verification
  }

  return programmaticVerify(problem, result.cells);
}

function programmaticVerify(
  problem: ReturnType<typeof buildProblemDescription>,
  cells: SolveCell[]
): VerificationResult {
  const checks: VerificationCheck[] = [];
  const hardViolations: { constraint: string; detail: string }[] = [];
  const softViolations: { constraint: string; detail: string }[] = [];

  // Check 1: Each assignment has correct weekly periods
  const assignmentCounts: Record<string, number> = {};
  for (const a of problem.assignments) {
    assignmentCounts[`${a.teacher}|${a.subject}|${a.className}|${a.weeklyPeriods}`] = 0;
  }
  for (const cell of cells) {
    for (const entry of cell.entries) {
      if (entry.assignmentKey in assignmentCounts) {
        assignmentCounts[entry.assignmentKey]++;
      }
    }
  }
  let periodsOk = true;
  for (const a of problem.assignments) {
    const key = `${a.teacher}|${a.subject}|${a.className}|${a.weeklyPeriods}`;
    const expected = parseInt(a.weeklyPeriods, 10);
    const actual = assignmentCounts[key] || 0;
    if (actual !== expected) {
      periodsOk = false;
      hardViolations.push({
        constraint: `Phân công: ${a.teacher} - ${a.subject} - ${a.className}`,
        detail: `Yêu cầu ${expected} tiết, thực tế ${actual} tiết`,
      });
    }
  }
  checks.push({
    name: "Số tiết/tuần",
    passed: periodsOk,
    detail: periodsOk ? "Tất cả phân công đủ số tiết" : "Có phân công thiếu/thừa tiết",
  });

  // Check 2: No teacher conflict
  let teacherOk = true;
  const slotTeachers: Record<string, string[]> = {};
  for (const cell of cells) {
    for (const entry of cell.entries) {
      if (!slotTeachers[cell.slotId]) slotTeachers[cell.slotId] = [];
      slotTeachers[cell.slotId].push(entry.teacher);
    }
  }
  for (const [slot, teachers] of Object.entries(slotTeachers)) {
    const unique = new Set(teachers);
    if (unique.size < teachers.length) {
      teacherOk = false;
      const dupes = teachers.filter((t, i) => teachers.indexOf(t) !== i);
      hardViolations.push({
        constraint: "Không trùng giáo viên",
        detail: `Slot ${slot}: giáo viên ${[...new Set(dupes)].join(", ")} dạy trùng`,
      });
    }
  }
  checks.push({
    name: "Trùng giáo viên",
    passed: teacherOk,
    detail: teacherOk ? "Không có xung đột" : "Có giáo viên dạy trùng slot",
  });

  // Check 3: No class conflict
  let classOk = true;
  const slotClasses: Record<string, string[]> = {};
  for (const cell of cells) {
    for (const entry of cell.entries) {
      if (!slotClasses[cell.slotId]) slotClasses[cell.slotId] = [];
      slotClasses[cell.slotId].push(entry.className);
    }
  }
  for (const [slot, cls] of Object.entries(slotClasses)) {
    const unique = new Set(cls);
    if (unique.size < cls.length) {
      classOk = false;
      const dupes = cls.filter((c, i) => cls.indexOf(c) !== i);
      hardViolations.push({
        constraint: "Không trùng lớp",
        detail: `Slot ${slot}: lớp ${[...new Set(dupes)].join(", ")} học trùng`,
      });
    }
  }
  checks.push({
    name: "Trùng lớp",
    passed: classOk,
    detail: classOk ? "Không có xung đột" : "Có lớp học trùng slot",
  });

  const passed = periodsOk && teacherOk && classOk;
  return { passed, checks, hardViolations, softViolations };
}

// ─── Step 6: AI analyzes infeasibility ───────────────────────
async function analyzeInfeasibility(
  problem: ReturnType<typeof buildProblemDescription>,
  solverMessage: string,
  generatedCode: string
): Promise<InfeasibilityAnalysis> {
  const zai = await ZAI.create();

  const systemPrompt = `You are a timetable scheduling expert. Given a scheduling problem that was found to be infeasible, analyze why and provide actionable suggestions in Vietnamese.

Return a JSON object:
{
  "conflicts": ["mô tả xung đột 1", "mô tả xung đột 2", ...],
  "suggestions": ["gợi ý khắc phục 1", "gợi ý khắc phục 2", ...]
}`;

  const userPrompt = `Bài toán xếp thời khóa biểu sau KHÔNG CÓ NGHIỆM:

Giáo viên: ${problem.teachers.join(", ")}
Lớp: ${problem.classes.join(", ")}
Môn: ${problem.subjects.join(", ")}

Phân công:
${JSON.stringify(problem.assignments, null, 2)}

Ràng buộc:
${JSON.stringify(problem.constraints, null, 2)}

Slot khả dụng: ${problem.totalSlotsAvailable}
Tổng tiết cần: ${problem.totalPeriodsNeeded}

Thông điệp solver: ${solverMessage}

Phân tích xung đột và đề xuất cách khắc phục.`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    thinking: { type: "disabled" },
  });

  const text = completion.choices[0]?.message?.content || "";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as InfeasibilityAnalysis;
    }
  } catch {
    // fallback
  }

  return {
    conflicts: ["Không thể xếp thời khóa biểu với các ràng buộc hiện tại"],
    suggestions: [
      "Giảm số tiết/tuần cho một số phân công",
      "Bỏ hoặc nới lỏng các ràng buộc bắt buộc",
      "Thêm buổi học hoặc ngày học",
    ],
  };
}

// ─── Step 7: AI generates brief report ───────────────────────
async function generateReport(
  problem: ReturnType<typeof buildProblemDescription>,
  result: { status: string; cells: SolveCell[]; verification: VerificationResult | null }
): Promise<string> {
  const zai = await ZAI.create();

  const filledSlots = result.cells.filter((c) => c.entries.length > 0).length;
  const hardV = result.verification?.hardViolations.length || 0;
  const softV = result.verification?.softViolations.length || 0;

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `Bạn là trợ lý thời khóa biểu thông minh. Viết báo cáo ngắn gọn bằng tiếng Việt về kết quả xếp thời khóa biểu. Tối đa 5 câu. Bao gồm:
- Tổng quan kết quả (thành công/thất bại)
- Số lượng entity (lớp, giáo viên, môn)
- Tỷ lệ lấp đầy slot
- Nếu có vi phạm, nêu cụ thể
- Đề xuất ngắn nếu cần`,
      },
      {
        role: "user",
        content: `Kết quả: ${result.status}
Số lớp: ${problem.classes.length}
Số giáo viên: ${problem.teachers.length}
Số môn: ${problem.subjects.length}
Tổng phân công: ${problem.assignments.length}
Tổng slot: ${problem.totalSlotsAvailable}
Slot đã xếp: ${filledSlots}
Tỷ lệ lấp: ${problem.totalSlotsAvailable > 0 ? ((filledSlots / problem.totalSlotsAvailable) * 100).toFixed(1) : 0}%
Xác minh: ${result.verification?.passed ? "Đạt" : "Có vi phạm"}
Vi phạm hard: ${hardV}
Vi phạm soft: ${softV}`,
      },
    ],
    thinking: { type: "disabled" },
  });

  return completion.choices[0]?.message?.content || "Đã tạo thời khóa biểu.";
}

// ─── Helper: Extract useful error from stderr ────────────────
function extractPythonError(stderr: string): string {
  // Get the last traceback lines (most relevant)
  const lines = stderr.split("\n").filter((l) => l.trim());
  // Find the last error line
  const errorIdx = lines.reduce((last, line, i) => {
    if (line.match(/^(Error|Traceback|  File|.*Error:)/)) return i;
    return last;
  }, -1);

  if (errorIdx >= 0) {
    // Return last 10 relevant lines
    return lines.slice(Math.max(errorIdx, lines.length - 10)).join("\n");
  }
  return stderr.slice(-500);
}

// ─── Helper: Extract JSON from Python output ─────────────────
function extractJsonFromOutput(stdout: string): string | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  // Try direct parse first
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Continue to try extraction
  }

  // Find JSON object boundaries
  let depth = 0;
  let start = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (trimmed[i] === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = trimmed.substring(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          start = -1;
        }
      }
    }
  }

  return null;
}

// ─── Main POST handler ───────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      selectedDays,
      selectedSessions,
      periodsPerSession,
      disabledSlots,
      teachers,
      subjects,
      classes,
      assignments,
      constraints,
    } = body;

    // Validate
    if (!selectedDays?.length || !selectedSessions?.length || !teachers?.length || !assignments?.length) {
      return NextResponse.json(
        {
          status: "error",
          message: "Thiếu dữ liệu đầu vào cần thiết (ngày, buổi, giáo viên, phân công)",
          cells: [],
          verification: null,
          generatedCode: null,
          aiReport: null,
          infeasibilityAnalysis: null,
        } satisfies TimetableResult,
        { status: 400 }
      );
    }

    // Step 1: Build problem description
    const problem = buildProblemDescription({
      selectedDays,
      selectedSessions,
      periodsPerSession,
      disabledSlots: disabledSlots || [],
      teachers,
      subjects: subjects || [],
      classes: classes || [],
      assignments,
      constraints: constraints || [],
    });

    // Step 2: AI defines the problem (analyze constraints)
    let problemAnalysis: string;
    try {
      problemAnalysis = await aiDefineProblem(problem);
    } catch (err) {
      // If problem definition fails, continue without it
      problemAnalysis = "Không thể phân tích bài toán. Sẽ tiến hành tạo code trực tiếp.";
    }

    // Step 3: AI generates OR-Tools code (with self-healing retry)
    let generatedCode = "";
    let solverOutput: {
      status?: string;
      message?: string;
      cells?: SolveCell[];
      infeasibilityHints?: string[];
    } | null = null;

    for (let attempt = 0; attempt <= MAX_CODE_RETRIES; attempt++) {
      // Generate code
      try {
        if (attempt === 0) {
          generatedCode = await generateOrtoolsCode(problem, problemAnalysis);
        } else {
          // Retry: feed previous error back to AI
          const lastStderr = solverOutput === null ? "Unknown error" : "Code execution failed";
          generatedCode = await generateOrtoolsCode(
            problem,
            problemAnalysis,
            lastStderr,
            generatedCode
          );
        }
      } catch (err) {
        return NextResponse.json({
          status: "error",
          message: `AI không thể tạo code (lần thử ${attempt + 1}): ${err instanceof Error ? err.message : "Unknown error"}`,
          cells: [],
          verification: null,
          generatedCode,
          aiReport: null,
          infeasibilityAnalysis: null,
        } satisfies TimetableResult);
      }

      // Execute the generated Python code
      const problemJson = JSON.stringify({
        slots: problem.slots,
        assignments: problem.assignments.map((a) => ({
          assignmentId: `${a.teacher}|${a.subject}|${a.className}|${a.weeklyPeriods}`,
          teacher: a.teacher,
          subject: a.subject,
          className: a.className,
          weeklyPeriods: parseInt(a.weeklyPeriods, 10),
        })),
        constraints: problem.constraints,
        teachers: problem.teachers,
        subjects: problem.subjects,
        classes: problem.classes,
      });

      const execResult = await executePythonCode(generatedCode, problemJson);

      // Try to parse solver output
      const jsonStr = extractJsonFromOutput(execResult.stdout);

      if (jsonStr) {
        try {
          solverOutput = JSON.parse(jsonStr);
          // Successfully got valid JSON output — break out of retry loop
          break;
        } catch {
          // JSON parse failed — will retry if attempts remain
        }
      }

      // If we have stderr with an error and can retry
      if (attempt < MAX_CODE_RETRIES && execResult.exitCode !== 0) {
        const errorDetail = extractPythonError(execResult.stderr);
        // Feed error back for next iteration
        solverOutput = null;
        // Update generatedCode with error info for the retry
        const _lastError = errorDetail;
        continue;
      }

      // No more retries — handle the error
      if (!jsonStr) {
        const errorMsg = execResult.stderr
          ? extractPythonError(execResult.stderr)
          : `Solver exited with code ${execResult.exitCode}`;

        // Last retry attempt with error feedback
        if (attempt < MAX_CODE_RETRIES) {
          try {
            generatedCode = await generateOrtoolsCode(
              problem,
              problemAnalysis,
              errorMsg,
              generatedCode
            );

            const retryResult = await executePythonCode(generatedCode, problemJson);
            const retryJson = extractJsonFromOutput(retryResult.stdout);

            if (retryJson) {
              try {
                solverOutput = JSON.parse(retryJson);
                break;
              } catch {
                // Final attempt also failed
              }
            }
          } catch {
            // Retry generation failed
          }
        }

        return NextResponse.json({
          status: "error",
          message: `Lỗi thực thi solver: ${errorMsg}`,
          cells: [],
          verification: null,
          generatedCode,
          aiReport: null,
          infeasibilityAnalysis: null,
        } satisfies TimetableResult);
      }
    }

    if (!solverOutput) {
      return NextResponse.json({
        status: "error",
        message: "Không thể nhận kết quả từ solver sau nhiều lần thử",
        cells: [],
        verification: null,
        generatedCode,
        aiReport: null,
        infeasibilityAnalysis: null,
      } satisfies TimetableResult);
    }

    const solverStatus = solverOutput.status || "error";
    const solverCells = solverOutput.cells || [];
    const solverMessage = solverOutput.message || "";

    // Step 4: Handle infeasible
    if (solverStatus === "infeasible") {
      const infeasibilityAnalysis = await analyzeInfeasibility(
        problem,
        solverMessage,
        generatedCode
      ).catch(() => ({
        conflicts: solverOutput?.infeasibilityHints || ["Bài toán không có nghiệm"],
        suggestions: ["Giảm ràng buộc bắt buộc", "Thêm slot thời gian", "Giảm số tiết/tuần"],
      }));

      const aiReport = `❌ Không thể xếp thời khóa biểu. ${infeasibilityAnalysis.conflicts.length} xung đột được phát hiện.`;

      return NextResponse.json({
        status: "infeasible",
        message: solverMessage || "Không thể xếp thời khóa biểu hợp lệ",
        cells: [],
        verification: null,
        generatedCode,
        aiReport,
        infeasibilityAnalysis,
      } satisfies TimetableResult);
    }

    if (solverStatus === "error") {
      return NextResponse.json({
        status: "error",
        message: solverMessage || "Solver gặp lỗi",
        cells: [],
        verification: null,
        generatedCode,
        aiReport: null,
        infeasibilityAnalysis: null,
      } satisfies TimetableResult);
    }

    // Step 5: Verify the result
    let verification: VerificationResult;
    try {
      verification = await verifyResult(problem, {
        status: solverStatus,
        cells: solverCells,
        message: solverMessage,
      });
    } catch {
      verification = programmaticVerify(problem, solverCells);
    }

    // Step 6: Generate AI report
    let aiReport: string;
    try {
      aiReport = await generateReport(problem, {
        status: solverStatus,
        cells: solverCells,
        verification,
      });
    } catch {
      aiReport = `Đã tạo thời khóa biểu cho ${classes?.length || 0} lớp với ${teachers?.length || 0} giáo viên.`;
    }

    return NextResponse.json({
      status: "solved",
      message: solverMessage || "Đã tạo thời khóa biểu thành công",
      cells: solverCells,
      verification,
      generatedCode,
      aiReport,
      infeasibilityAnalysis: null,
    } satisfies TimetableResult);
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "Lỗi không xác định",
        cells: [],
        verification: null,
        generatedCode: null,
        aiReport: null,
        infeasibilityAnalysis: null,
      } satisfies TimetableResult,
      { status: 500 }
    );
  }
}
