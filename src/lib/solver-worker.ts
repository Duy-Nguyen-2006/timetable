import type { SolverDirectResult, SolverExecutionRequest, SolverProblem } from './sandbox'
import { runSolverDirect } from './sandbox'

export type SolverWorkerClient = {
  run: (problem: SolverProblem | SolverExecutionRequest) => Promise<SolverDirectResult>
  close: () => Promise<void>
}

export function createSolverWorkerClient(): SolverWorkerClient {
  return {
    run: (problem: SolverProblem | SolverExecutionRequest) => runSolverDirect(problem),
    close: async () => {},
  }
}
