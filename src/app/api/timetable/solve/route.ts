import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ZAI from "z-ai-web-dev-sdk";

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
    mon: "Thứ 2",
    tue: "Thứ 3",
    wed: "Thứ 4",
    thu: "Thứ 5",
    fri: "Thứ 6",
    sat: "Thứ 7",
    sun: "Chủ nhật",
  };
  const sessionLabels: Record<string, string> = {
    morning: "Sáng",
    afternoon: "Chiều",
    evening: "Tối",
  };

  const slots: { slotId: string; dayId: string; dayLabel: string; sessionId: string; sessionLabel: string; period: number }[] = [];
  for (const dayId of input.selectedDays) {
    for (const sessionId of input.selectedSessions) {
      const maxP = input.periodsPerSession[sessionId] || 0;
      for (let p = 1; p <= maxP; p++) {
        const slotId = `${dayId}-${sessionId}-${p}`;
        if (!input.disabledSlots.includes(slotId)) {
          slots.push({
            slotId,
            dayId,
            dayLabel: dayLabels[dayId] || dayId,
            sessionId,
            sessionLabel: sessionLabels[sessionId] || sessionId,
            period: p,
          });
        }
      }
    }
  }

  return { slots, assignments: input.assignments, constraints: input.constraints, teachers: input.teachers, subjects: input.subjects, classes: input.classes };
}

// ─── Step 2: AI generates OR-Tools Python code ───────────────
async function generateOrtoolsCode(problem: ReturnType<typeof buildProblemDescription>): Promise<string> {
  const zai = await ZAI.create();

  const systemPrompt = `You are an expert OR-Tools CP-SAT constraint programming engineer specializing in school timetable scheduling.

Your task: Given a complete scheduling problem description in JSON, write a COMPLETE, SELF-CONTAINED Python script that:
1. Reads the problem JSON from stdin
2. Builds a CP-SAT model with boolean decision variables x[assignment_id, slot_id] 
3. Adds ALL necessary constraints including:
   - Each assignment must have exactly its required number of weekly periods
   - No teacher teaches two different classes at the same time slot
   - No class has two different subjects at the same time slot
   - ALL user-defined constraints (both required/hard and preferred/soft)
4. For hard constraints: use model.Add() - these MUST be satisfied
5. For soft constraints: add to objective function with model.Maximize() or model.Minimize()
6. Solves the model and outputs JSON to stdout with this exact format:
   {"status": "solved"|"infeasible"|"error", "message": "...", "cells": [{"slotId":"...", "dayId":"...", "sessionId":"...", "period": N, "entries": [{"assignmentKey":"...", "subject":"...", "teacher":"...", "className":"..."}]}]}

CRITICAL RULES:
- You must dynamically interpret EACH constraint text and write appropriate OR-Tools code for it
- Do NOT hardcode constraint types - read each constraint.text and write code that handles it
- Common constraint patterns to recognize:
  * "Giáo viên X không dạy [buổi/ngày/slot Y]" → forbid variables for that teacher at those slots
  * "Môn X nên xếp buổi sáng/chiều" → soft constraint maximizing placement in preferred session
  * "Lớp X không học quá N tiết môn Y/tuần" → limit sum of variables
  * "Giáo viên X dạy tối đa N tiết/ngày" → daily cap per teacher
  * "Môn X không xếp 2 tiết liên tiếp cho lớp Y" → consecutive slot restriction
  * "Giáo viên X chỉ dạy thứ Y" → restrict to specific day slots
  * Any other pattern: interpret naturally and write appropriate constraint code
- For infeasible results, also include: "infeasibilityHints": ["hint1", "hint2"]
- The assignment key format is: "teacher|subject|className|weeklyPeriods"
- Output ONLY valid JSON to stdout, nothing else
- Use json.dumps(result, ensure_ascii=False) for output
- Set solver parameters: max_time_in_seconds=30, num_workers=4
- Import only: json, sys, ortools.sat.python.cp_model
- The script MUST be complete and runnable as-is`;

  const userPrompt = `Here is the scheduling problem:

${JSON.stringify(problem, null, 2)}

Write the complete Python OR-Tools CP-SAT solver script. Remember:
- Dynamically interpret each constraint.text and generate appropriate OR-Tools code
- Hard constraints (type="required") MUST be satisfied (use model.Add)
- Soft constraints (type="preferred") should be optimized (add to objective with model.Maximize or model.Minimize)
- Output ONLY the Python code, no markdown, no explanation`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: systemPrompt },
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

  return code;
}

// ─── Step 3: Execute Python code ─────────────────────────────
function executePythonCode(code: string, problemJson: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const workDir = join(tmpdir(), `tack-solve-${Date.now()}`);
    mkdirSync(workDir, { recursive: true });

    const scriptPath = join(workDir, "solver.py");
    writeFileSync(scriptPath, code, "utf-8");

    const child = spawn("python3", [scriptPath], {
      cwd: workDir,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 45000,
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

// ─── Step 4: AI verifies the result ──────────────────────────
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
}`;

  const userPrompt = `Original problem constraints:
${JSON.stringify(problem.constraints, null, 2)}

Assignments:
${JSON.stringify(problem.assignments, null, 2)}

Solver result:
${JSON.stringify(result, null, 2)}

Verify the result and return the JSON verification report.`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    thinking: { type: "disabled" },
  });

  const text = completion.choices[0]?.message?.content || "";

  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as VerificationResult;
    }
  } catch {
    // Fallback
  }

  // Fallback: basic programmatic verification
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
  checks.push({ name: "Số tiết/tuần", passed: periodsOk, detail: periodsOk ? "Tất cả phân công đủ số tiết" : "Có phân công thiếu/thừa tiết" });

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
      hardViolations.push({ constraint: "Không trùng giáo viên", detail: `Slot ${slot}: giáo viên ${[...new Set(dupes)].join(", ")} dạy trùng` });
    }
  }
  checks.push({ name: "Trùng giáo viên", passed: teacherOk, detail: teacherOk ? "Không có xung đột" : "Có giáo viên dạy trùng slot" });

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
      hardViolations.push({ constraint: "Không trùng lớp", detail: `Slot ${slot}: lớp ${[...new Set(dupes)].join(", ")} học trùng` });
    }
  }
  checks.push({ name: "Trùng lớp", passed: classOk, detail: classOk ? "Không có xung đột" : "Có lớp học trùng slot" });

  const passed = periodsOk && teacherOk && classOk;
  return { passed, checks, hardViolations, softViolations };
}

// ─── Step 5: AI analyzes infeasibility ───────────────────────
async function analyzeInfeasibility(
  problem: ReturnType<typeof buildProblemDescription>,
  solverMessage: string,
  generatedCode: string
): Promise<InfeasibilityAnalysis> {
  const zai = await ZAI.create();

  const systemPrompt = `You are a timetable scheduling expert. Given a scheduling problem that was found to be infeasible, analyze why and provide actionable suggestions.

Return a JSON object:
{
  "conflicts": ["description of conflict 1", "description of conflict 2", ...],
  "suggestions": ["suggestion 1", "suggestion 2", ...]
}`;

  const userPrompt = `The following scheduling problem was infeasible:

Teachers: ${problem.teachers.join(", ")}
Classes: ${problem.classes.join(", ")}
Subjects: ${problem.subjects.join(", ")}

Assignments:
${JSON.stringify(problem.assignments, null, 2)}

Constraints:
${JSON.stringify(problem.constraints, null, 2)}

Available slots: ${problem.slots.length}
Total periods needed: ${problem.assignments.reduce((sum, a) => sum + parseInt(a.weeklyPeriods, 10), 0)}

Solver message: ${solverMessage}

Generated code output:
${generatedCode.substring(0, 2000)}

Analyze the conflicts and suggest fixes.`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: systemPrompt },
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

// ─── Step 6: AI generates brief report ───────────────────────
async function generateReport(
  problem: ReturnType<typeof buildProblemDescription>,
  result: { status: string; cells: SolveCell[]; verification: VerificationResult | null }
): Promise<string> {
  const zai = await ZAI.create();

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content: "Bạn là trợ lý thời khóa biểu. Viết báo cáo ngắn gọn bằng tiếng Việt về kết quả xếp thời khóa biểu. Tối đa 3 câu.",
      },
      {
        role: "user",
        content: `Kết quả: ${result.status}
Số lớp: ${problem.classes.length}
Số giáo viên: ${problem.teachers.length}
Số môn: ${problem.subjects.length}
Tổng phân công: ${problem.assignments.length}
Tổng slot có lịch: ${result.cells.filter((c) => c.entries.length > 0).length}
Xác minh: ${result.verification?.passed ? "Đạt" : "Có vi phạm"}
Vi phạm hard: ${result.verification?.hardViolations.length || 0}
Vi phạm soft: ${result.verification?.softViolations.length || 0}`,
      },
    ],
    thinking: { type: "disabled" },
  });

  return completion.choices[0]?.message?.content || "Đã tạo thời khóa biểu.";
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

    // Step 2: AI generates OR-Tools code
    let generatedCode: string;
    try {
      generatedCode = await generateOrtoolsCode(problem);
    } catch (err) {
      return NextResponse.json({
        status: "error",
        message: `AI không thể tạo code: ${err instanceof Error ? err.message : "Unknown error"}`,
        cells: [],
        verification: null,
        generatedCode: null,
        aiReport: null,
        infeasibilityAnalysis: null,
      } satisfies TimetableResult);
    }

    // Step 3: Execute the generated Python code
    const problemJson = JSON.stringify({
      slots: problem.slots,
      assignments: problem.assignments.map((a, i) => ({
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

    // Parse solver output
    let solverOutput: {
      status?: string;
      message?: string;
      cells?: SolveCell[];
      infeasibilityHints?: string[];
    };

    try {
      // Try to find JSON in stdout
      const jsonStr = execResult.stdout.trim();
      if (!jsonStr) {
        throw new Error(execResult.stderr || `Solver exited with code ${execResult.exitCode}`);
      }
      solverOutput = JSON.parse(jsonStr);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Không thể parse kết quả solver";
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
        conflicts: solverOutput.infeasibilityHints || ["Bài toán không có nghiệm"],
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
