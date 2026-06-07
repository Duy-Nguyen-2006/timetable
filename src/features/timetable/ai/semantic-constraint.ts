/**
 * Semantic Constraint Representation
 *
 * This layer represents constraints that are not safely covered by built-in ConstraintSpec kinds.
 * It is not shown to users directly - it's the internal representation for code generation
 * when built-in constraints cannot represent the user's intent.
 */

export type SemanticCondition =
  | { op: 'teacher_teaching_at_slot'; teacher: string; day: string; period: number }
  | { op: 'teacher_not_teaching_at_slot'; teacher: string; day: string; period: number }
  | { op: 'teacher_teaching_on_day'; teacher: string; day: string }
  | { op: 'teacher_not_teaching_on_day'; teacher: string; day: string }
  | { op: 'class_has_subject_at_slot'; class: string; subject: string; day: string; period: number }
  | { op: 'and'; args: SemanticCondition[] }
  | { op: 'or'; args: SemanticCondition[] }
  | { op: 'not'; arg: SemanticCondition };

export type SemanticAction =
  | { op: 'teacher_required_slot'; teacher: string; day: string; period: number }
  | { op: 'teacher_block_slot'; teacher: string; day: string; period: number }
  | { op: 'teacher_required_day'; teacher: string; day: string }
  | { op: 'teacher_block_day'; teacher: string; day: string }
  | { op: 'assignment_required_slot'; assignmentId: string; day: string; period: number }
  | { op: 'assignment_block_slot'; assignmentId: string; day: string; period: number };

export type SemanticConstraint =
  | {
      type: 'if_then';
      if: SemanticCondition;
      then: SemanticAction[];
    }
  | {
      type: 'all_of';
      constraints: SemanticConstraint[];
    }
  | {
      type: 'unsupported_precise_text';
      text: string;
      reason: string;
    };

export type SemanticCandidate = {
  source: 'built_in' | 'semantic';
  confidence: 'high' | 'medium' | 'low';
  specs?: import('./constraint-spec').ConstraintSpec[];
  semantic?: SemanticConstraint;
  assumptions: string[];
  unresolvedQuestions: string[];
};

export type ReparseResult = {
  status: 'candidate' | 'unsupported' | 'needs_retry';
  displayText: string;
  candidate: SemanticCandidate;
};
