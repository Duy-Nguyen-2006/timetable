import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  python: {
    executeCode: (code: string, input: any, timeoutMs: number, solverWorkers?: number) =>
      ipcRenderer.invoke('python:executeCode', code, input, timeoutMs, solverWorkers),
  },
  solverRuntime: {
    setMode: (mode: string) => ipcRenderer.invoke('solver-runtime:set', mode),
    probeDocker: () => ipcRenderer.invoke('solver-runtime:probeDocker'),
    onNotice: (handler: (payload: { level: string; message: string }) => void) => {
      const listener = (_event: unknown, payload: { level: string; message: string }) =>
        handler(payload);
      ipcRenderer.on('solver-runtime:notice', listener);
      return () => ipcRenderer.removeListener('solver-runtime:notice', listener);
    },
  },
  secureStore: {
    saveProvider: (config: unknown) => ipcRenderer.invoke('secure-store:save-provider', config),
    loadProvider: () => ipcRenderer.invoke('secure-store:load-provider'),
    clearProvider: () => ipcRenderer.invoke('secure-store:clear-provider'),
    isAvailable: () => ipcRenderer.invoke('secure-store:available'),
  },
});
