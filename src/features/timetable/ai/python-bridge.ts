/**
 * python-bridge.ts
 * High-level bridge between the local AI agent and the Python execution host.
 *
 * In the final implementation this talks to the main process via IPC.
 * For now it contains the interface + a dev stub.
 */

import type { ExecutionResult } from './types';

export interface PythonBridgeOptions {
  timeoutMs?: number;
  solverWorkers?: number;
  /** Section 14.8: optional fixed seed for solver determinism. */
  solverSeed?: number;
  signal?: AbortSignal;
}

/**
 * Execute the fixed Python solver skeleton with the prepared input payload.
 * The skeleton is loaded from `/templates/solver_skeleton.py` (or the
 * `/api/ai/solver-skeleton` route) and never carries AI-generated custom
 * code — the planner/coder/repair pipeline was removed.
 */
export async function executeSolverCode(
  code: string,
  input: unknown,
  options: PythonBridgeOptions = {}
): Promise<ExecutionResult> {
  const timeout = options.timeoutMs ?? 360_000;

  // In production this will be an IPC call to the main process
  // which actually spawns the bundled binary.
  if (typeof window !== 'undefined' && window.electron?.python?.executeCode) {
    // FIX.md §1: solverSeed (5th arg) — cast bypasses older preload type defs.
    return (window.electron.python.executeCode as (
      code: string,
      input: unknown,
      timeout: number,
      workers?: number,
      seed?: number,
    ) => Promise<ExecutionResult>)(
      code, input, timeout, options.solverWorkers, options.solverSeed,
    );
  }

  // Web fallback: call server-side executor route.
  if (typeof window !== 'undefined') {
    const response = await fetch('/api/solver/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        input,
        timeoutMs: timeout,
        solverWorkers: options.solverWorkers,
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok || !payload?.result) {
      throw new Error(
        payload?.error ||
          `[python-bridge] Server executor failed with HTTP ${response.status}`
      );
    }

    return payload.result as ExecutionResult;
  }

  throw new Error(
    '[python-bridge] Python executor IPC is not available. Please run inside Electron app (with preload exposing window.electron.python.executeCode) or wire a server execution route.'
  );
}

/**
 * Backward-compatible alias. The function used to be called
 * `executeGeneratedCode` when the AI codegen path was still alive.
 */
export const executeGeneratedCode = executeSolverCode;
