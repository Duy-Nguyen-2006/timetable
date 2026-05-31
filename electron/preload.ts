import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  python: {
    executeCode: (code: string, input: any, timeoutMs: number, solverWorkers?: number) =>
      ipcRenderer.invoke('python:executeCode', code, input, timeoutMs, solverWorkers),
  },
});
