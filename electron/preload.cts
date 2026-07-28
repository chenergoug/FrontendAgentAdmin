import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('frontendAgent', {
  openProjectClient: (projectId: string) => ipcRenderer.invoke('project-client:open', projectId),
  closeProjectClient: (projectId: string) => ipcRenderer.invoke('project-client:close', projectId),
  selectDirectory: () => ipcRenderer.invoke('native-dialog:select-directory'),
  onProjectClientChanged: (listener: (event: { projectId: string; status: 'opened' | 'closed' }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { projectId: string; status: 'opened' | 'closed' }) => listener(payload);
    ipcRenderer.on('project-client:changed', handler);
    return () => ipcRenderer.removeListener('project-client:changed', handler);
  },
});
