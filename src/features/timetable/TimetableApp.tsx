"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  X,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  FileCode2,
  ShieldCheck,
  AlertCircle,
  Copy,
  CheckCheck,
} from "lucide-react";
import type {
  WizardPage,
  Assignment,
  Constraint,
  TimetableResult,
  SolveProgress,
} from "./types";
import {
  days,
  sessions,
  defaultPeriods,
  subjectPresets,
  classPresetGroups,
  teacherColors,
  constraintTypeList,
  panelClass,
  navBarClass,
  navBackClass,
  navNextClass,
  solveProgressSteps,
} from "./constants";
import { getCellKey, makeAssignmentKey, generateId, getTeacherColorIndex } from "./utils";
import { QuotaDisplay } from "./QuotaDisplay";

interface TimetableAppProps {
  onOpenSettings: () => void;
  onBack: () => void;
}

export function TimetableApp({ onOpenSettings, onBack }: TimetableAppProps) {
  // ── Wizard state ──────────────────────────────────────
  const [page, setPage] = useState<WizardPage>("select");
  const [selectedDays, setSelectedDays] = useState<string[]>([
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
  ]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([
    "morning",
    "afternoon",
  ]);
  const [periodsPerSession, setPeriodsPerSession] = useState<
    Record<string, number>
  >({ ...defaultPeriods });
  const [disabledSlots, setDisabledSlots] = useState<Set<string>>(new Set());
  const [teachers, setTeachers] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);

  // ── Result state ──────────────────────────────────────
  const [result, setResult] = useState<TimetableResult | null>(null);
  const [solving, setSolving] = useState(false);
  const [solveProgress, setSolveProgress] = useState<SolveProgress>({
    step: 0,
    label: "",
  });
  const [showCode, setShowCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // ── Input helpers ─────────────────────────────────────
  const [newTeacher, setNewTeacher] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newClass, setNewClass] = useState("");
  const [newConstraintText, setNewConstraintText] = useState("");
  const [newConstraintType, setNewConstraintType] = useState<
    "required" | "preferred"
  >("required");

  // ── New assignment form ───────────────────────────────
  const [assignTeacher, setAssignTeacher] = useState("");
  const [assignSubject, setAssignSubject] = useState("");
  const [assignClass, setAssignClass] = useState("");
  const [assignPeriods, setAssignPeriods] = useState("2");

  // ── Page navigation helpers ───────────────────────────
  const pageOrder: WizardPage[] = [
    "select",
    "periods",
    "final",
    "details",
    "subjects",
    "classes",
    "assignments",
    "constraints",
    "result",
  ];

  const currentPageIndex = pageOrder.indexOf(page);

  const canGoNext = useCallback((): boolean => {
    switch (page) {
      case "select":
        return selectedDays.length > 0 && selectedSessions.length > 0;
      case "periods":
        return selectedSessions.every(
          (s) => (periodsPerSession[s] || 0) > 0
        );
      case "final":
        return true;
      case "details":
        return teachers.length > 0;
      case "subjects":
        return subjects.length > 0;
      case "classes":
        return classes.length > 0;
      case "assignments":
        return assignments.length > 0;
      case "constraints":
        return true;
      case "result":
        return false;
      default:
        return false;
    }
  }, [
    page,
    selectedDays,
    selectedSessions,
    periodsPerSession,
    teachers,
    subjects,
    classes,
    assignments,
  ]);

  const goNext = useCallback(() => {
    if (!canGoNext()) return;
    const nextIdx = currentPageIndex + 1;
    if (nextIdx < pageOrder.length) {
      setPage(pageOrder[nextIdx]);
    }
  }, [canGoNext, currentPageIndex, pageOrder]);

  const goBack = useCallback(() => {
    if (page === "select") {
      onBack();
      return;
    }
    const prevIdx = currentPageIndex - 1;
    if (prevIdx >= 0) {
      setPage(pageOrder[prevIdx]);
    }
  }, [currentPageIndex, pageOrder, page, onBack]);

  // ── Toggle helpers ────────────────────────────────────
  const toggleDay = (id: string) => {
    setSelectedDays((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const toggleSession = (id: string) => {
    setSelectedSessions((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleSlot = (key: string) => {
    setDisabledSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Add / remove helpers ──────────────────────────────
  const addTeacher = () => {
    const t = newTeacher.trim();
    if (t && !teachers.includes(t)) {
      setTeachers([...teachers, t]);
      setNewTeacher("");
    }
  };

  const removeTeacher = (t: string) => setTeachers(teachers.filter((x) => x !== t));

  const addSubject = () => {
    const s = newSubject.trim();
    if (s && !subjects.includes(s)) {
      setSubjects([...subjects, s]);
      setNewSubject("");
    }
  };

  const removeSubject = (s: string) => setSubjects(subjects.filter((x) => x !== s));

  const addPresetSubjects = (names: string[]) => {
    const newOnes = names.filter((n) => !subjects.includes(n));
    if (newOnes.length > 0) setSubjects([...subjects, ...newOnes]);
  };

  const addClass = () => {
    const c = newClass.trim();
    if (c && !classes.includes(c)) {
      setClasses([...classes, c]);
      setNewClass("");
    }
  };

  const removeClass = (c: string) => setClasses(classes.filter((x) => x !== c));

  const addPresetClasses = (cls: string[]) => {
    const newOnes = cls.filter((c) => !classes.includes(c));
    if (newOnes.length > 0) setClasses([...classes, ...newOnes]);
  };

  const addAssignment = () => {
    if (!assignTeacher || !assignSubject || !assignClass || !assignPeriods)
      return;
    const a: Assignment = {
      key: makeAssignmentKey(
        assignTeacher,
        assignSubject,
        assignClass,
        assignPeriods
      ),
      teacher: assignTeacher,
      subject: assignSubject,
      className: assignClass,
      weeklyPeriods: assignPeriods,
    };
    setAssignments([...assignments, a]);
    setAssignTeacher("");
    setAssignSubject("");
    setAssignClass("");
    setAssignPeriods("2");
  };

  const removeAssignment = (key: string) =>
    setAssignments(assignments.filter((a) => a.key !== key));

  const addConstraint = () => {
    const t = newConstraintText.trim();
    if (!t) return;
    const c: Constraint = {
      id: generateId(),
      type: newConstraintType,
      text: t,
    };
    setConstraints([...constraints, c]);
    setNewConstraintText("");
  };

  const removeConstraint = (id: string) =>
    setConstraints(constraints.filter((c) => c.id !== id));

  // ── Solve ─────────────────────────────────────────────
  const handleSolve = useCallback(async () => {
    setSolving(true);
    setResult(null);
    setSolveProgress({ step: 0, label: solveProgressSteps[0] });

    // Simulate progress
    const progressInterval = setInterval(() => {
      setSolveProgress((prev) => {
        const next = prev.step + 1;
        if (next < solveProgressSteps.length) {
          return { step: next, label: solveProgressSteps[next] };
        }
        return prev;
      });
    }, 3000);

    try {
      const payload = {
        selectedDays,
        selectedSessions,
        periodsPerSession,
        disabledSlots: Array.from(disabledSlots),
        teachers,
        subjects,
        classes,
        assignments: assignments.map(({ key, ...rest }) => rest),
        constraints: constraints.map(({ type, text }) => ({ type, text })),
      };

      const res = await fetch("/api/timetable/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      clearInterval(progressInterval);
      setResult(data);
    } catch (err) {
      clearInterval(progressInterval);
      setResult({
        status: "error",
        message: err instanceof Error ? err.message : "Lỗi không xác định",
        cells: [],
        verification: null,
        generatedCode: null,
        aiReport: null,
        infeasibilityAnalysis: null,
      });
    } finally {
      setSolving(false);
    }
  }, [
    selectedDays,
    selectedSessions,
    periodsPerSession,
    disabledSlots,
    teachers,
    subjects,
    classes,
    assignments,
    constraints,
  ]);

  // ── Copy code ─────────────────────────────────────────
  const handleCopyCode = useCallback(() => {
    if (result?.generatedCode) {
      navigator.clipboard.writeText(result.generatedCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  }, [result]);

  // ── Build timetable grid data for result page ─────────
  const resultGridByClass = useMemo(() => {
    if (!result || result.status !== "solved") return {};
    const byClass: Record<
      string,
      Record<string, { subject: string; teacher: string; colorIdx: number }[]>
    > = {};

    for (const cls of classes) {
      byClass[cls] = {};
    }

    for (const cell of result.cells) {
      for (const entry of cell.entries) {
        const cls = entry.className;
        if (!byClass[cls]) byClass[cls] = {};
        const key = getCellKey(cell.dayId, cell.sessionId, cell.period);
        if (!byClass[cls][key]) byClass[cls][key] = [];
        byClass[cls][key].push({
          subject: entry.subject,
          teacher: entry.teacher,
          colorIdx: getTeacherColorIndex(entry.teacher, teachers),
        });
      }
    }
    return byClass;
  }, [result, classes, teachers]);

  // ── Selected day/session info ─────────────────────────
  const activeDays = days.filter((d) => selectedDays.includes(d.id));
  const activeSessions = sessions.filter((s) =>
    selectedSessions.includes(s.id)
  );

  // ── Page title map ────────────────────────────────────
  const pageTitle: Record<WizardPage, string> = {
    select: "Chọn ngày & buổi",
    periods: "Số tiết mỗi buổi",
    final: "Xem trước lưới",
    details: "Giáo viên",
    subjects: "Môn học",
    classes: "Lớp học",
    assignments: "Phân công",
    constraints: "Ràng buộc",
    result: "Kết quả",
  };

  // ── RENDER ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
      {/* Nav bar */}
      <nav className={navBarClass}>
        <button onClick={goBack} className={navBackClass}>
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại</span>
        </button>
        <h1 className="text-sm font-medium text-white/80">
          {pageTitle[page]}
        </h1>
        {page !== "result" ? (
          <button
            onClick={goNext}
            disabled={!canGoNext()}
            className={
              canGoNext()
                ? navNextClass
                : "px-4 py-2 bg-[#4DB848]/40 text-white/50 font-medium rounded-lg text-sm cursor-not-allowed"
            }
          >
            Tiếp tục <ArrowRight className="w-3.5 h-3.5 inline ml-1" />
          </button>
        ) : (
          <QuotaDisplay onOpenSettings={onOpenSettings} />
        )}
      </nav>

      {/* Content */}
      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full">
        {/* ─── SELECT PAGE ──────────────────────────────── */}
        {page === "select" && (
          <div className="space-y-6">
            {/* Days */}
            <div className={panelClass}>
              <h2 className="text-white text-sm font-medium mb-4">
                Chọn ngày học
              </h2>
              <div className="flex flex-wrap gap-2">
                {days.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => toggleDay(d.id)}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      selectedDays.includes(d.id)
                        ? "bg-[#4DB848]/20 text-[#4DB848] border border-[#4DB848]/40"
                        : "bg-[#1a1a1a] text-white/40 border border-white/[0.06] hover:text-white/60"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sessions */}
            <div className={panelClass}>
              <h2 className="text-white text-sm font-medium mb-4">
                Chọn buổi học
              </h2>
              <div className="flex flex-wrap gap-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => toggleSession(s.id)}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      selectedSessions.includes(s.id)
                        ? "bg-[#4DB848]/20 text-[#4DB848] border border-[#4DB848]/40"
                        : "bg-[#1a1a1a] text-white/40 border border-white/[0.06] hover:text-white/60"
                    }`}
                  >
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── PERIODS PAGE ─────────────────────────────── */}
        {page === "periods" && (
          <div className={panelClass}>
            <h2 className="text-white text-sm font-medium mb-4">
              Số tiết tối đa mỗi buổi
            </h2>
            <div className="space-y-4">
              {activeSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-4 bg-[#1a1a1a] rounded-lg p-4 border border-white/[0.06]"
                >
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-white/80 text-sm flex-1">
                    {s.label}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() =>
                        setPeriodsPerSession((prev) => ({
                          ...prev,
                          [s.id]: Math.max(1, (prev[s.id] || 1) - 1),
                        }))
                      }
                      className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/60 flex items-center justify-center transition-colors"
                    >
                      −
                    </button>
                    <span className="text-white text-lg font-medium w-8 text-center">
                      {periodsPerSession[s.id] || 0}
                    </span>
                    <button
                      onClick={() =>
                        setPeriodsPerSession((prev) => ({
                          ...prev,
                          [s.id]: Math.min(10, (prev[s.id] || 0) + 1),
                        }))
                      }
                      className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/60 flex items-center justify-center transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── FINAL (GRID PREVIEW) PAGE ────────────────── */}
        {page === "final" && (
          <div className={panelClass}>
            <h2 className="text-white text-sm font-medium mb-2">
              Xem trước lưới thời khóa biểu
            </h2>
            <p className="text-white/40 text-xs mb-4">
              Nhấn vào ô để bật/tắt (ô bị tắt sẽ không xếp lịch)
            </p>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-white/40 p-2 text-left w-16 sticky left-0 bg-[#141414]">
                      Buổi
                    </th>
                    <th className="text-white/40 p-2 text-left w-8 sticky left-16 bg-[#141414]">
                      Tiết
                    </th>
                    {activeDays.map((d) => (
                      <th
                        key={d.id}
                        className="text-white/60 p-2 text-center font-medium"
                      >
                        {d.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeSessions.map((s) => {
                    const maxP = periodsPerSession[s.id] || 0;
                    const rows = Array.from({ length: maxP }, (_, i) => i + 1);
                    return rows.map((p) => {
                      return (
                        <tr key={`${s.id}-${p}`} className="border-t border-white/[0.04]">
                          {p === 1 && (
                            <td
                              className="p-2 text-white/50 align-middle sticky left-0 bg-[#141414]"
                              rowSpan={maxP}
                            >
                              <span className="flex items-center gap-1">
                                {s.icon} {s.label}
                              </span>
                            </td>
                          )}
                          <td className="p-2 text-white/30 text-center sticky left-16 bg-[#141414]">
                            {p}
                          </td>
                          {activeDays.map((d) => {
                            const cellKey = getCellKey(d.id, s.id, p);
                            const disabled = disabledSlots.has(cellKey);
                            return (
                              <td key={cellKey} className="p-1 text-center">
                                <button
                                  onClick={() => toggleSlot(cellKey)}
                                  className={`w-full h-8 rounded-md transition-all text-xs ${
                                    disabled
                                      ? "bg-white/[0.02] text-white/15 border border-white/[0.04] line-through"
                                      : "bg-[#4DB848]/10 text-[#4DB848]/60 border border-[#4DB848]/20 hover:bg-[#4DB848]/20"
                                  }`}
                                >
                                  {disabled ? "✕" : "✓"}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── DETAILS (TEACHERS) PAGE ──────────────────── */}
        {page === "details" && (
          <div className={panelClass}>
            <h2 className="text-white text-sm font-medium mb-4">
              Danh sách giáo viên
            </h2>
            <div className="flex gap-2 mb-4">
              <input
                value={newTeacher}
                onChange={(e) => setNewTeacher(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTeacher()}
                placeholder="Nhập tên giáo viên..."
                className="flex-1 bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#4DB848]/50 focus:ring-1 focus:ring-[#4DB848]/30 transition-colors"
              />
              <button
                onClick={addTeacher}
                disabled={!newTeacher.trim()}
                className="px-4 py-2.5 bg-[#4DB848] hover:bg-[#3da33d] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Thêm
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-1">
              {teachers.map((t, i) => {
                const color = teacherColors[i % teacherColors.length];
                return (
                  <div
                    key={t}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${color.bg} border ${color.border}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${color.bg} border ${color.border}`}
                      />
                      <span className={`text-sm ${color.text}`}>{t}</span>
                    </div>
                    <button
                      onClick={() => removeTeacher(t)}
                      className="text-white/30 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {teachers.length === 0 && (
                <p className="text-white/20 text-sm text-center py-8">
                  Chưa có giáo viên nào
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── SUBJECTS PAGE ────────────────────────────── */}
        {page === "subjects" && (
          <div className={panelClass}>
            <h2 className="text-white text-sm font-medium mb-4">
              Danh sách môn học
            </h2>

            {/* Presets */}
            <div className="mb-4">
              <p className="text-white/40 text-xs mb-2">
                Thêm nhanh từ mẫu:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {subjectPresets.map((sp) => (
                  <button
                    key={sp.name}
                    onClick={() => addPresetSubjects([sp.name])}
                    disabled={subjects.includes(sp.name)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                      subjects.includes(sp.name)
                        ? "bg-white/[0.04] text-white/20 border border-white/[0.04] cursor-not-allowed"
                        : "bg-[#1a1a1a] text-white/50 border border-white/[0.06] hover:text-white/70 hover:border-white/[0.1]"
                    }`}
                  >
                    {sp.name}
                    <span className="text-white/20 ml-1">({sp.abbr})</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() =>
                  addPresetSubjects(subjectPresets.map((s) => s.name))
                }
                className="mt-2 text-[#4DB848] hover:text-[#5cc956] text-xs transition-colors"
              >
                + Thêm tất cả
              </button>
            </div>

            {/* Custom input */}
            <div className="flex gap-2 mb-4">
              <input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSubject()}
                placeholder="Nhập môn học tùy chỉnh..."
                className="flex-1 bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#4DB848]/50 focus:ring-1 focus:ring-[#4DB848]/30 transition-colors"
              />
              <button
                onClick={addSubject}
                disabled={!newSubject.trim()}
                className="px-4 py-2.5 bg-[#4DB848] hover:bg-[#3da33d] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Thêm
              </button>
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-1">
              {subjects.map((s) => (
                <div
                  key={s}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#1a1a1a] border border-white/[0.06]"
                >
                  <span className="text-sm text-white/70">{s}</span>
                  <button
                    onClick={() => removeSubject(s)}
                    className="text-white/30 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {subjects.length === 0 && (
                <p className="text-white/20 text-sm text-center py-8">
                  Chưa có môn học nào
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── CLASSES PAGE ─────────────────────────────── */}
        {page === "classes" && (
          <div className={panelClass}>
            <h2 className="text-white text-sm font-medium mb-4">
              Danh sách lớp học
            </h2>

            {/* Preset groups */}
            <div className="mb-4 space-y-2">
              <p className="text-white/40 text-xs">Thêm nhanh từ mẫu:</p>
              {classPresetGroups.map((g) => (
                <div
                  key={g.label}
                  className="flex items-center gap-2 flex-wrap"
                >
                  <span className="text-white/30 text-xs w-12">
                    {g.label}:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {g.classes.map((c) => (
                      <button
                        key={c}
                        onClick={() => addPresetClasses([c])}
                        disabled={classes.includes(c)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                          classes.includes(c)
                            ? "bg-white/[0.04] text-white/20 border border-white/[0.04] cursor-not-allowed"
                            : "bg-[#1a1a1a] text-white/50 border border-white/[0.06] hover:text-white/70 hover:border-white/[0.1]"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                    <button
                      onClick={() => addPresetClasses(g.classes)}
                      className="text-[#4DB848] hover:text-[#5cc956] text-xs px-2 py-1.5 transition-colors"
                    >
                      + Tất cả
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Custom input */}
            <div className="flex gap-2 mb-4">
              <input
                value={newClass}
                onChange={(e) => setNewClass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addClass()}
                placeholder="Nhập tên lớp tùy chỉnh..."
                className="flex-1 bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#4DB848]/50 focus:ring-1 focus:ring-[#4DB848]/30 transition-colors"
              />
              <button
                onClick={addClass}
                disabled={!newClass.trim()}
                className="px-4 py-2.5 bg-[#4DB848] hover:bg-[#3da33d] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Thêm
              </button>
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-1">
              {classes.map((c) => (
                <div
                  key={c}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#1a1a1a] border border-white/[0.06]"
                >
                  <span className="text-sm text-white/70">{c}</span>
                  <button
                    onClick={() => removeClass(c)}
                    className="text-white/30 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {classes.length === 0 && (
                <p className="text-white/20 text-sm text-center py-8">
                  Chưa có lớp học nào
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── ASSIGNMENTS PAGE ─────────────────────────── */}
        {page === "assignments" && (
          <div className={panelClass}>
            <h2 className="text-white text-sm font-medium mb-4">
              Phân công giảng dạy
            </h2>

            {/* Add assignment form */}
            <div className="bg-[#1a1a1a] rounded-lg p-4 border border-white/[0.06] mb-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-white/40 text-xs mb-1 block">
                    Giáo viên
                  </label>
                  <select
                    value={assignTeacher}
                    onChange={(e) => setAssignTeacher(e.target.value)}
                    className="w-full bg-[#141414] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4DB848]/50 appearance-none"
                  >
                    <option value="">-- Chọn --</option>
                    {teachers.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-white/40 text-xs mb-1 block">
                    Môn học
                  </label>
                  <select
                    value={assignSubject}
                    onChange={(e) => setAssignSubject(e.target.value)}
                    className="w-full bg-[#141414] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4DB848]/50 appearance-none"
                  >
                    <option value="">-- Chọn --</option>
                    {subjects.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-white/40 text-xs mb-1 block">
                    Lớp
                  </label>
                  <select
                    value={assignClass}
                    onChange={(e) => setAssignClass(e.target.value)}
                    className="w-full bg-[#141414] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4DB848]/50 appearance-none"
                  >
                    <option value="">-- Chọn --</option>
                    {classes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-white/40 text-xs mb-1 block">
                    Số tiết/tuần
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={assignPeriods}
                    onChange={(e) => setAssignPeriods(e.target.value)}
                    className="w-full bg-[#141414] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4DB848]/50"
                  />
                </div>
              </div>
              <button
                onClick={addAssignment}
                disabled={
                  !assignTeacher || !assignSubject || !assignClass || !assignPeriods
                }
                className="px-4 py-2.5 bg-[#4DB848] hover:bg-[#3da33d] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Thêm phân công
              </button>
            </div>

            {/* Assignments list */}
            <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-1">
              {assignments.map((a, i) => {
                const color = teacherColors[i % teacherColors.length];
                return (
                  <div
                    key={a.key}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${color.bg} border ${color.border}`}
                  >
                    <div className="flex items-center gap-3 text-sm">
                      <span className={color.text}>{a.teacher}</span>
                      <span className="text-white/20">→</span>
                      <span className="text-white/60">{a.subject}</span>
                      <span className="text-white/20">→</span>
                      <span className="text-white/50">{a.className}</span>
                      <span className="text-white/20 text-xs">
                        ({a.weeklyPeriods} tiết/tuần)
                      </span>
                    </div>
                    <button
                      onClick={() => removeAssignment(a.key)}
                      className="text-white/30 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {assignments.length === 0 && (
                <p className="text-white/20 text-sm text-center py-8">
                  Chưa có phân công nào
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── CONSTRAINTS PAGE ─────────────────────────── */}
        {page === "constraints" && (
          <div className={panelClass}>
            <h2 className="text-white text-sm font-medium mb-2">
              Ràng buộc
            </h2>
            <p className="text-white/40 text-xs mb-4">
              Thêm các điều kiện cho thời khóa biểu. AI sẽ phân tích và áp dụng.
            </p>

            {/* Add constraint */}
            <div className="bg-[#1a1a1a] rounded-lg p-4 border border-white/[0.06] mb-4 space-y-3">
              <div className="flex gap-2">
                <select
                  value={newConstraintType}
                  onChange={(e) =>
                    setNewConstraintType(
                      e.target.value as "required" | "preferred"
                    )
                  }
                  className="bg-[#141414] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4DB848]/50 appearance-none"
                >
                  {constraintTypeList.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.label}
                    </option>
                  ))}
                </select>
                <input
                  value={newConstraintText}
                  onChange={(e) => setNewConstraintText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addConstraint()}
                  placeholder="Ví dụ: Thứ 2 buổi sáng không xếp Toán cho 6A..."
                  className="flex-1 bg-[#141414] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#4DB848]/50 focus:ring-1 focus:ring-[#4DB848]/30 transition-colors"
                />
                <button
                  onClick={addConstraint}
                  disabled={!newConstraintText.trim()}
                  className="px-4 py-2.5 bg-[#4DB848] hover:bg-[#3da33d] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-4 h-4" /> Thêm
                </button>
              </div>
            </div>

            {/* Constraints list */}
            <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-1">
              {constraints.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${
                    c.type === "required"
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-amber-500/10 border-amber-500/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        c.type === "required"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {c.type === "required" ? "BẮT BUỘC" : "NÊN CÓ"}
                    </span>
                    <span className="text-sm text-white/70">{c.text}</span>
                  </div>
                  <button
                    onClick={() => removeConstraint(c.id)}
                    className="text-white/30 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {constraints.length === 0 && (
                <p className="text-white/20 text-sm text-center py-8">
                  Chưa có ràng buộc. Bạn có thể thêm hoặc bỏ qua bước này.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── RESULT PAGE ──────────────────────────────── */}
        {page === "result" && (
          <div className="space-y-4">
            {/* Solve button / loading */}
            {!solving && !result && (
              <div className={panelClass + " text-center py-12"}>
                <div className="w-16 h-16 rounded-2xl bg-[#4DB848]/10 border border-[#4DB848]/20 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-[#4DB848]" />
                </div>
                <h2 className="text-white text-lg font-medium mb-2">
                  Sẵn sàng tạo thời khóa biểu
                </h2>
                <p className="text-white/40 text-sm mb-6 max-w-md mx-auto">
                  AI sẽ phân tích ràng buộc, tạo code OR-Tools, giải bài toán và xác minh kết quả.
                </p>
                <button
                  onClick={handleSolve}
                  className="px-6 py-3 bg-[#4DB848] hover:bg-[#3da33d] text-white font-medium rounded-lg text-sm transition-colors flex items-center gap-2 mx-auto"
                >
                  <Sparkles className="w-4 h-4" />
                  Tạo thời khóa biểu
                </button>
              </div>
            )}

            {/* Loading state */}
            {solving && (
              <div className={panelClass + " text-center py-12"}>
                <div className="relative w-16 h-16 mx-auto mb-6">
                  <svg
                    className="animate-spin w-16 h-16 text-[#4DB848]"
                    viewBox="0 0 64 64"
                    fill="none"
                  >
                    <circle
                      className="opacity-20"
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-80"
                      fill="currentColor"
                      d="M32 4a28 28 0 0128 28h-4a24 24 0 00-24-24V4z"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-[#4DB848] animate-pulse" />
                  </div>
                </div>

                <h2 className="text-white text-lg font-medium mb-4">
                  Đang xử lý...
                </h2>

                <div className="space-y-2 max-w-xs mx-auto">
                  {solveProgressSteps.map((step, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-sm transition-all duration-500 ${
                        i < solveProgress.step
                          ? "text-[#4DB848]"
                          : i === solveProgress.step
                          ? "text-white"
                          : "text-white/20"
                      }`}
                    >
                      {i < solveProgress.step ? (
                        <Check className="w-4 h-4" />
                      ) : i === solveProgress.step ? (
                        <div className="w-4 h-4 rounded-full border-2 border-[#4DB848] border-t-transparent animate-spin" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-white/10" />
                      )}
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error state */}
            {result && result.status === "error" && (
              <div className={panelClass + " text-center py-12"}>
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <h2 className="text-white text-lg font-medium mb-2">
                  Đã xảy ra lỗi
                </h2>
                <p className="text-white/40 text-sm mb-6 max-w-md mx-auto">
                  {result.message}
                </p>
                <button
                  onClick={handleSolve}
                  className="px-6 py-3 bg-[#4DB848] hover:bg-[#3da33d] text-white font-medium rounded-lg text-sm transition-colors flex items-center gap-2 mx-auto"
                >
                  <RotateCcw className="w-4 h-4" />
                  Thử lại
                </button>
              </div>
            )}

            {/* Infeasible state */}
            {result && result.status === "infeasible" && (
              <div className="space-y-4">
                <div className={panelClass + " text-center py-8"}>
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-8 h-8 text-amber-400" />
                  </div>
                  <h2 className="text-white text-lg font-medium mb-2">
                    Không thể xếp lịch
                  </h2>
                  <p className="text-white/40 text-sm">
                    {result.message}
                  </p>
                </div>

                {/* Infeasibility analysis */}
                {result.infeasibilityAnalysis && (
                  <div className={panelClass}>
                    <h3 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Phân tích xung đột
                    </h3>
                    <div className="space-y-3">
                      {result.infeasibilityAnalysis.conflicts.length > 0 && (
                        <div>
                          <p className="text-white/40 text-xs mb-2">
                            Các xung đột phát hiện:
                          </p>
                          <ul className="space-y-1">
                            {result.infeasibilityAnalysis.conflicts.map(
                              (c, i) => (
                                <li
                                  key={i}
                                  className="text-sm text-red-400/80 flex items-start gap-2"
                                >
                                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400/60 shrink-0" />
                                  {c}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                      {result.infeasibilityAnalysis.suggestions.length > 0 && (
                        <div>
                          <p className="text-white/40 text-xs mb-2">
                            Gợi ý khắc phục:
                          </p>
                          <ul className="space-y-1">
                            {result.infeasibilityAnalysis.suggestions.map(
                              (s, i) => (
                                <li
                                  key={i}
                                  className="text-sm text-[#4DB848]/80 flex items-start gap-2"
                                >
                                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#4DB848]/60 shrink-0" />
                                  {s}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      setPage("constraints");
                      setResult(null);
                    }}
                    className="px-5 py-2.5 bg-transparent hover:bg-white/[0.06] text-white/70 hover:text-white font-medium rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" /> Sửa ràng buộc
                  </button>
                  <button
                    onClick={handleSolve}
                    className="px-5 py-2.5 bg-[#4DB848] hover:bg-[#3da33d] text-white font-medium rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Thử lại
                  </button>
                </div>
              </div>
            )}

            {/* Solved state */}
            {result && result.status === "solved" && (
              <div className="space-y-4">
                {/* Success header */}
                <div className={panelClass + " text-center py-6"}>
                  <div className="w-14 h-14 rounded-2xl bg-[#4DB848]/10 border border-[#4DB848]/20 flex items-center justify-center mx-auto mb-3">
                    <Check className="w-7 h-7 text-[#4DB848]" />
                  </div>
                  <h2 className="text-white text-lg font-medium">
                    Tạo thời khóa biểu thành công!
                  </h2>
                </div>

                {/* AI Report */}
                {result.aiReport && (
                  <div className={panelClass}>
                    <h3 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#4DB848]" />
                      Báo cáo AI
                    </h3>
                    <p className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap">
                      {result.aiReport}
                    </p>
                  </div>
                )}

                {/* Verification Report */}
                {result.verification && (
                  <div className={panelClass}>
                    <h3 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#4DB848]" />
                      Báo cáo xác minh
                    </h3>

                    <div className="space-y-2 mb-4">
                      {result.verification.checks.map((chk, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2 p-2.5 rounded-lg ${
                            chk.passed
                              ? "bg-[#4DB848]/5 border border-[#4DB848]/10"
                              : "bg-red-500/5 border border-red-500/10"
                          }`}
                        >
                          {chk.passed ? (
                            <Check className="w-4 h-4 text-[#4DB848] shrink-0 mt-0.5" />
                          ) : (
                            <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <p
                              className={`text-sm font-medium ${
                                chk.passed ? "text-[#4DB848]" : "text-red-400"
                              }`}
                            >
                              {chk.name}
                            </p>
                            <p className="text-white/40 text-xs">{chk.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Violations */}
                    {result.verification.hardViolations.length > 0 && (
                      <div className="mb-3">
                        <p className="text-red-400 text-xs font-medium mb-1">
                          Vi phạm bắt buộc:
                        </p>
                        {result.verification.hardViolations.map((v, i) => (
                          <p key={i} className="text-red-400/70 text-xs ml-3">
                            • {v.constraint}: {v.detail}
                          </p>
                        ))}
                      </div>
                    )}
                    {result.verification.softViolations.length > 0 && (
                      <div>
                        <p className="text-amber-400 text-xs font-medium mb-1">
                          Vi phạm ràng buộc mềm:
                        </p>
                        {result.verification.softViolations.map((v, i) => (
                          <p key={i} className="text-amber-400/70 text-xs ml-3">
                            • {v.constraint}: {v.detail}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Timetable Grid */}
                <div className={panelClass}>
                  <h3 className="text-white text-sm font-medium mb-4 flex items-center gap-2">
                    📋 Thời khóa biểu
                  </h3>

                  {/* Class tabs */}
                  {classes.map((cls) => (
                    <div key={cls} className="mb-6 last:mb-0">
                      <h4 className="text-white/60 text-sm font-medium mb-2 pb-1 border-b border-white/[0.06]">
                        Lớp {cls}
                      </h4>
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-xs border-collapse min-w-[600px]">
                          <thead>
                            <tr>
                              <th className="text-white/30 p-1.5 text-left w-14 bg-[#141414]">
                                Buổi
                              </th>
                              <th className="text-white/30 p-1.5 text-left w-8 bg-[#141414]">
                                Tiết
                              </th>
                              {activeDays.map((d) => (
                                <th
                                  key={d.id}
                                  className="text-white/50 p-1.5 text-center font-medium bg-[#141414]"
                                >
                                  {d.short}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activeSessions.map((s) => {
                              const maxP = periodsPerSession[s.id] || 0;
                              const rows = Array.from(
                                { length: maxP },
                                (_, i) => i + 1
                              );
                              return rows.map((p) => (
                                <tr
                                  key={`${cls}-${s.id}-${p}`}
                                  className="border-t border-white/[0.03]"
                                >
                                  {p === 1 && (
                                    <td
                                      className="p-1.5 text-white/40 align-top bg-[#141414] sticky left-0"
                                      rowSpan={maxP}
                                    >
                                      <span className="flex items-center gap-1 whitespace-nowrap">
                                        {s.icon} {s.label}
                                      </span>
                                    </td>
                                  )}
                                  <td className="p-1.5 text-white/25 text-center bg-[#141414] sticky left-14">
                                    {p}
                                  </td>
                                  {activeDays.map((d) => {
                                    const cellKey = getCellKey(
                                      d.id,
                                      s.id,
                                      p
                                    );
                                    const isDisabled = disabledSlots.has(
                                      getCellKey(d.id, s.id, p)
                                    );
                                    const entries =
                                      resultGridByClass[cls]?.[cellKey];

                                    if (isDisabled) {
                                      return (
                                        <td
                                          key={cellKey}
                                          className="p-1 text-center"
                                        >
                                          <div className="h-10 rounded bg-white/[0.02] flex items-center justify-center text-white/10">
                                            —
                                          </div>
                                        </td>
                                      );
                                    }

                                    if (!entries || entries.length === 0) {
                                      return (
                                        <td
                                          key={cellKey}
                                          className="p-1 text-center"
                                        >
                                          <div className="h-10 rounded bg-white/[0.02] border border-white/[0.03] flex items-center justify-center text-white/10">
                                            &nbsp;
                                          </div>
                                        </td>
                                      );
                                    }

                                    const entry = entries[0];
                                    const color =
                                      teacherColors[
                                        entry.colorIdx % teacherColors.length
                                      ];

                                    return (
                                      <td
                                        key={cellKey}
                                        className="p-1 text-center"
                                      >
                                        <div
                                          className={`h-10 rounded ${color.bg} border ${color.border} flex flex-col items-center justify-center px-1`}
                                        >
                                          <span
                                            className={`text-[10px] font-medium ${color.text} leading-tight`}
                                          >
                                            {entry.subject}
                                          </span>
                                          <span className="text-[9px] text-white/30 leading-tight">
                                            {entry.teacher}
                                          </span>
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ));
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Generated Code */}
                {result.generatedCode && (
                  <div className={panelClass}>
                    <button
                      onClick={() => setShowCode(!showCode)}
                      className="w-full flex items-center justify-between text-white/70 hover:text-white text-sm font-medium transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <FileCode2 className="w-4 h-4" />
                        Mã nguồn OR-Tools
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyCode();
                          }}
                          className="text-white/30 hover:text-white/60 transition-colors px-2 py-1"
                        >
                          {copiedCode ? (
                            <CheckCheck className="w-4 h-4 text-[#4DB848]" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        {showCode ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </button>
                    {showCode && (
                      <div className="mt-3 bg-[#0A0A0A] rounded-lg p-4 max-h-96 overflow-y-auto custom-scrollbar">
                        <pre className="text-[11px] text-white/50 font-mono whitespace-pre-wrap">
                          {result.generatedCode}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 justify-center pb-4">
                  <button
                    onClick={() => {
                      setResult(null);
                    }}
                    className="px-5 py-2.5 bg-transparent hover:bg-white/[0.06] text-white/70 hover:text-white font-medium rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Tạo lại
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
