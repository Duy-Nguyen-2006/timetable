/**
 * Global type declaration for the Electron bridge exposed via preload.ts.
 *
 * The bridge is optional -- in web/dev mode `window.electron` is undefined.
 * All properties return Promises (IPC invoke) except `onNotice` which returns
 * an unsubscribe function.
 */

import type { ExecutionResult } from '../features/timetable/ai/types';

interface ElectronPythonBridge {
  executeCode: (
    code: string,
    input: unknown,
    timeoutMs: number,
    solverWorkers?: number,
  ) => Promise<ExecutionResult>;
  syntaxCheck: (code: string) => Promise<{ ok: boolean; error?: string; errorDigest?: string }>;
  astCheck: (code: string) => Promise<{ ok: boolean; error?: string }>;
}

interface ElectronSolverRuntimeBridge {
  setMode: (mode: string) => Promise<void>;
  probeDocker: () => Promise<boolean>;
  onNotice: (handler: (payload: { level: string; message: string }) => void) => () => void;
}

interface ElectronSecureStoreBridge {
  saveProvider: (config: unknown) => Promise<void>;
  loadProvider: () => Promise<unknown>;
  clearProvider: () => Promise<void>;
  isAvailable: () => Promise<boolean>;
}

interface ElectronBridge {
  python: ElectronPythonBridge;
  solverRuntime: ElectronSolverRuntimeBridge;
  secureStore: ElectronSecureStoreBridge;
}

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}

export type { ElectronBridge, ElectronPythonBridge, ElectronSolverRuntimeBridge, ElectronSecureStoreBridge };
