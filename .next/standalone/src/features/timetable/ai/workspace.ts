import type { ConstraintSpec, Plan, Violation } from './constraint-spec';
import type { CompressedPayload } from './input-compressor';

export type WorkspaceState = {
  dataset?: CompressedPayload;
  constraintSpecs?: ConstraintSpec[];
  plan?: Plan;
  latestConstraintCode?: string;
  latestGeneratedSolver?: string;
  violations?: Violation[];
  errorDigest?: string;
  attempts: Array<{
    stage: string;
    summary: string;
    at: string;
  }>;
};

export class WorkspaceBoard {
  private readonly state: WorkspaceState = {
    attempts: [],
  };

  setDataset(dataset: CompressedPayload): void {
    this.state.dataset = dataset;
  }

  setConstraintSpecs(constraintSpecs: ConstraintSpec[]): void {
    this.state.constraintSpecs = constraintSpecs;
  }

  setPlan(plan: Plan): void {
    this.state.plan = plan;
  }

  setLatestConstraintCode(latestConstraintCode: string): void {
    this.state.latestConstraintCode = latestConstraintCode;
  }

  setLatestGeneratedSolver(latestGeneratedSolver: string): void {
    this.state.latestGeneratedSolver = latestGeneratedSolver;
  }

  setViolations(violations: Violation[]): void {
    this.state.violations = violations;
  }

  setErrorDigest(errorDigest: string): void {
    this.state.errorDigest = errorDigest;
  }

  addAttempt(stage: string, summary: string): void {
    this.state.attempts.push({
      stage,
      summary,
      at: new Date().toISOString(),
    });
  }

  snapshot(): WorkspaceState {
    return structuredClone(this.state);
  }
}
