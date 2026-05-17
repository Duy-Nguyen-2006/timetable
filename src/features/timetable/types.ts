export type DayInfo = {
  id: string;
  label: string;
  short: string;
  tableLabel: string;
};

export type SessionInfo = {
  id: string;
  label: string;
  icon: string;
};

export type Assignment = {
  key: string;
  teacher: string;
  subject: string;
  className: string;
  weeklyPeriods: string;
};

export type Constraint = {
  id: string;
  type: "required" | "preferred";
  text: string;
};

export type SolveCellEntry = {
  assignmentKey: string;
  subject: string;
  teacher: string;
  className: string;
};

export type SolveCell = {
  slotId: string;
  dayId: string;
  sessionId: string;
  period: number;
  entries: SolveCellEntry[];
};

export type VerificationCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type VerificationResult = {
  passed: boolean;
  checks: VerificationCheck[];
  hardViolations: { constraint: string; detail: string }[];
  softViolations: { constraint: string; detail: string }[];
};

export type InfeasibilityAnalysis = {
  conflicts: string[];
  suggestions: string[];
};

export type TimetableResult = {
  status: "solved" | "infeasible" | "error";
  message: string;
  cells: SolveCell[];
  verification: VerificationResult | null;
  generatedCode: string | null;
  aiReport: string | null;
  infeasibilityAnalysis: InfeasibilityAnalysis | null;
};

export type WizardPage =
  | "select"
  | "periods"
  | "final"
  | "details"
  | "subjects"
  | "classes"
  | "assignments"
  | "constraints"
  | "result";

export type TimetableConfig = {
  selectedDays: string[];
  selectedSessions: string[];
  periodsPerSession: Record<string, number>;
  disabledSlots: Set<string>;
  teachers: string[];
  subjects: string[];
  classes: string[];
  assignments: Assignment[];
  constraints: Constraint[];
};

export type SolveProgress = {
  step: number;
  label: string;
};
