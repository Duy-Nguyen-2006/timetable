import type { ConstraintSpec } from './constraint-spec';
import type { SemanticConstraint } from './semantic-constraint';

export type RawConstraintInput = {
  id: string;
  text: string;
  type: 'required' | 'preferred';
  weight?: number;
  createdAt: string;
};

export type ConstraintParseStatus =
  | 'parsed'
  | 'needs_review'
  | 'ambiguous'
  | 'unparsed'
  | 'unsupported'
  | 'ignored';

export type ConstraintUnderstandingStatus =
  | 'parsed_waiting_approval'
  | 'approved'
  | 'rejected_reparsing'
  | 'reparsed_waiting_approval'
  | 'unsupported'
  | 'failed_to_understand';

export type ConstraintParseIssueCode =
  | 'unknown_entity'
  | 'multiple_entity_matches'
  | 'unsupported_kind'
  | 'hard_unchecked'
  | 'missing_required_param'
  | 'room_constraint_ignored'
  | 'low_confidence'
  | 'scope_too_broad'
  | 'llm_fallback_used'
  | 'needs_user_clarification'
  | 'possible_entity_loss';

export type ConstraintClarificationQuestion = {
  id: string;
  prompt: string;
  options: string[];
};

export type ConstraintParseIssue = {
  code: ConstraintParseIssueCode;
  message: string;
  field?: string;
  candidates?: string[];
};

export type ReparseAttempt = {
  summary: string;
  displayText: string;
  spec?: ConstraintSpec;
  semantic?: SemanticConstraint;
  source: 'built_in' | 'semantic';
  confidence: 'high' | 'medium' | 'low';
  assumptions: string[];
  createdAt: string;
};

export type ParsedConstraintDraft = {
  id: string;
  rawConstraintId: string;
  original: string;
  proposedSpecs: ConstraintSpec[];
  status: ConstraintParseStatus;
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
  issues: ConstraintParseIssue[];
  clarificationQuestions?: ConstraintClarificationQuestion[];
  source: 'rule' | 'translator' | 'manual' | 'template' | 'ai_reparse';
  confirmedAt?: string;
  /** Re-parse tracking */
  previousAttempts?: ReparseAttempt[];
  reparseCount?: number;
  semanticRepresentation?: SemanticConstraint;
  /** The approved display text shown to user */
  displayText?: string;
};

export type ConfirmedConstraint = {
  id: string;
  rawConstraintId: string;
  specs: ConstraintSpec[];
  confirmedBy: 'user' | 'system_template';
  confirmedAt: string;
  summary: string;
  /** The user-approved Vietnamese display text */
  displayText: string;
  semanticRepresentation?: SemanticConstraint;
};

export type PreflightBlockReason =
  | 'hard_raw_unconfirmed'
  | 'hard_draft_unresolved'
  | 'hard_spec_unchecked'
  | 'no_confirmed_specs'
  | 'constraint_unconfirmed'
  | 'constraint_unparsed'
  | 'constraint_needs_clarification';

export type PreflightResult = {
  ok: boolean;
  canSolve: boolean;
  blockReasons: PreflightBlockReason[];
  messages: string[];
  warnings: string[];
};
