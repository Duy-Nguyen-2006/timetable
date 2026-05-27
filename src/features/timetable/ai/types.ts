/**
 * Local AI Agent Types for Tack Timetable
 * Based on the approved architecture plan.
 */

import type { OpenAI } from 'openai';

// ============================================
// Settings / Provider Config
// ============================================

export interface AIProviderConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

// ============================================
// Input Payload sent to the Python solver / generated code
// ============================================

export interface NormalizedEntity {
  id: string;
  label: string;
}

export interface NormalizedAssignment {
  id: string;
  teacher: NormalizedEntity;
  subject: NormalizedEntity;
  class: NormalizedEntity;
  weeklyPeriods: number;
}

export interface ConstraintItemInput {
  type: 'required' | 'preferred';
  text: string;
  weight?: number;
}

export interface AgentInputPayload {
  days: Array<{ id: string; label: string }>;
  sessions: Array<{ id: string; label: string }>;
  periodCounts: Record<string, number>;
  deletedPeriods: Record<string, boolean>;
  assignments: NormalizedAssignment[];
  constraints: ConstraintItemInput[];
  // Additional context the generated Python code may need
  metadata?: {
    schoolName?: string;
    semester?: string;
  };
}

// ============================================
// Python Executor I/O (stdin/stdout contract)
// ============================================

export interface ExecutionResult {
  success: boolean;
  has_solution: boolean;
  stdout: string;
  stderr: string;
  execution_time_ms: number;
  error_type: 'timeout' | 'exception' | 'no_solution' | 'parse_error' | null;
  result?: {
    classes: string[];
    days: string[];
    periods: (string | number)[];
    schedule: Array<{
      class: string;
      day: string;
      period: string | number;
      subject: string;
      teacher: string;
    }>;
  };
}

// ============================================
// Agent Lifecycle (reused/extended from existing UI)
// ============================================

export type AgentLifecyclePhase = 'thinking' | 'coding' | 'running' | 'checking' | 'fixing' | 'idle';

export interface AgentLifecycleEvent {
  id: string;
  phase: AgentLifecyclePhase;
  title: string;
  detail?: string;
  status: 'active' | 'success' | 'error' | 'warning';
  timestamp: string;
  attempt?: number;
  tags?: string[];
}

// ============================================
// Orchestrator Events (for streaming progress to UI)
// ============================================

export type AgentEvent =
  | { type: 'status'; message: string; iteration: number; maxIterations?: number }
  | { type: 'phase'; phase: AgentLifecyclePhase; message: string; iteration: number }
  | { type: 'coder_started'; attempt: number; message: string }
  | { type: 'coder_code_generated'; attempt: number; codeLength: number }
  | { type: 'running_code'; attempt: number; message?: string }
  | { type: 'execution_result'; attempt: number; result: ExecutionResult }
  | { type: 'coder_self_fix'; attempt: number; errorSummary: string }
  | { type: 'reviewer_started'; message: string }
  | { type: 'reviewer_result'; approved: boolean; feedback?: string }
  | { type: 'final_result'; result: any } // Will be TimetableSolveResult shape
  | { type: 'error'; message: string; fatal?: boolean };

// ============================================
// LLM Response Shapes (internal)
// ============================================

export interface CoderTurnResult {
  code: string;
  explanation?: string;
  rawResponse?: string;
}

export interface ReviewerResult {
  approved: boolean;
  feedback: string;
  rawResponse?: string;
}

// ============================================
// Main Orchestrator Config
// ============================================

export interface LocalAgentConfig extends AIProviderConfig {
  timeoutMs?: number; // default 180000 (3 minutes)
  onEvent?: (event: AgentEvent) => void;
}

// ============================================
// Re-export useful existing types if needed
// ============================================

export type { NormalizedAssignment as LegacyNormalizedAssignment } from '../utils';
