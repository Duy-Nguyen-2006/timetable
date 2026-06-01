const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  python: {
    executeCode: (code, input, timeoutMs, solverWorkers) =>
      ipcRenderer.invoke('python:executeCode', code, input, timeoutMs, solverWorkers),
    syntaxCheck: (code) => ipcRenderer.invoke('python:syntaxCheck', code),
    astCheck: (code) => ipcRenderer.invoke('python:astCheck', code),
  },
  solverRuntime: {
    setMode: (mode) => ipcRenderer.invoke('solver-runtime:set', mode),
    probeDocker: () => ipcRenderer.invoke('solver-runtime:probeDocker'),
    onNotice: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on('solver-runtime:notice', listener);
      return () => ipcRenderer.removeListener('solver-runtime:notice', listener);
    },
  },
  secureStore: {
    saveProvider: (config) => ipcRenderer.invoke('secure-store:save-provider', config),
    loadProvider: () => ipcRenderer.invoke('secure-store:load-provider'),
    clearProvider: () => ipcRenderer.invoke('secure-store:clear-provider'),
    isAvailable: () => ipcRenderer.invoke('secure-store:available'),
  },
});
