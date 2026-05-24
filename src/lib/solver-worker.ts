import type { SolverDirectResult, SolverProblem } from './sandbox'
import { runSolverDirect } from './sandbox'

export type SolverWorkerClient = {
  run: (problem: SolverProblem) => Promise<SolverDirectResult>
  close: () => Promise<void>
}

export function createSolverWorkerClient(): SolverWorkerClient {
  return {
    run: (problem: SolverProblem) => runSolverDirect(problem),
    close: async () => {},
  }
}
