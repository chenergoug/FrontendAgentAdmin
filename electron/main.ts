import './env.js';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runChildAcceptanceAutomation, runMainAcceptanceAutomation } from './automation/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererUrl = process.env.RENDERER_URL ?? 'http://127.0.0.1:5180';
const serviceUrl = process.env.SERVICE_URL ?? 'http://127.0.0.1:3880/api';
const projectWindows = new Map<string, BrowserWindow>();
const closingProjectIds = new Set<string>();
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow: BrowserWindow | null = null;

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

async function serviceIsReady() {
  try {
    const response = await fetch(`${serviceUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startPackagedService() {
  if (!app.isPackaged || await serviceIsReady()) return;
  const entry = path.join(app.getAppPath(), 'dist-service/index.js');
  await import(pathToFileURL(entry).href);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await serviceIsReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('内置服务启动超时');
}

function createWindowOptions(title: string) {
  return {
    width: 1480,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    title,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

async function loadMainPage(window: BrowserWindow) {
  if (app.isPackaged) {
    await window.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
    return;
  }
  await window.loadURL(rendererUrl);
}

async function loadChildPage(window: BrowserWindow, projectId: string) {
  const query = `projectId=${encodeURIComponent(projectId)}`;
  if (app.isPackaged) {
    await window.loadFile(path.join(app.getAppPath(), 'dist/child.html'), { query: { projectId } });
    return;
  }
  await window.loadURL(`${rendererUrl}/child.html?${query}`);
}

async function fetchProjectName(projectId: string) {
  try {
    const response = await fetch(`${serviceUrl}/projects/${encodeURIComponent(projectId)}`);
    const project = (await response.json()) as { name?: string } | null;
    return project?.name || projectId;
  } catch {
    return projectId;
  }
}

function createMainWindow() {
  const window = new BrowserWindow(createWindowOptions('Frontend Agent Admin'));
  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.maximize();
  void loadMainPage(window).then(() => runMainAcceptanceAutomation(window));
  return window;
}

ipcMain.handle('native-dialog:select-directory', async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const options: Electron.OpenDialogOptions = {
    title: '选择项目文件夹',
    properties: ['openDirectory', 'createDirectory'],
  };
  const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
});

ipcMain.handle('main:open-agent-configuration', (_event, request: unknown) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { opened: false };
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('main:agent-configuration-requested', request);
  return { opened: true };
});

async function markProjectClientClosed(projectId: string) {
  try {
    await fetch(`${serviceUrl}/projects/${encodeURIComponent(projectId)}/client/close`, { method: 'POST' });
  } catch {
    // The local service may already be stopped while Electron is closing.
  }
}

function notifyProjectClientChanged(projectId: string, status: 'opened' | 'closed') {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('project-client:changed', { projectId, status });
    }
  });
}

ipcMain.handle('project-client:open', async (_event, projectId: string) => {
  const openedWindow = projectWindows.get(projectId);
  if (openedWindow && !openedWindow.isDestroyed()) {
    if (openedWindow.isMinimized()) {
      openedWindow.restore();
    }
    openedWindow.focus();
    return { opened: false, focused: true, reason: 'Project client already opened.' };
  }

  const projectName = await fetchProjectName(projectId);
  const window = new BrowserWindow(createWindowOptions(`${projectName} - Frontend Agent Child Client`));
  projectWindows.set(projectId, window);
  window.webContents.on('render-process-gone', () => {
    void markProjectClientClosed(projectId).finally(() => notifyProjectClientChanged(projectId, 'closed'));
  });
  window.on('closed', () => {
    projectWindows.delete(projectId);
    if (closingProjectIds.has(projectId)) {
      closingProjectIds.delete(projectId);
      return;
    }
    void markProjectClientClosed(projectId).finally(() => notifyProjectClientChanged(projectId, 'closed'));
  });
  try {
    await loadChildPage(window, projectId);
    runChildAcceptanceAutomation(window);
  } catch (error) {
    projectWindows.delete(projectId);
    void markProjectClientClosed(projectId);
    if (!window.isDestroyed()) {
      window.destroy();
    }
    throw error;
  }

  notifyProjectClientChanged(projectId, 'opened');
  return { opened: true };
});

ipcMain.handle('project-client:close', async (_event, projectId: string) => {
  const openedWindow = projectWindows.get(projectId);
  if (openedWindow && !openedWindow.isDestroyed()) {
    projectWindows.delete(projectId);
    closingProjectIds.add(projectId);
    await markProjectClientClosed(projectId);
    notifyProjectClientChanged(projectId, 'closed');
    openedWindow.close();
    return { closed: true };
  }

  projectWindows.delete(projectId);
  await markProjectClientClosed(projectId);
  notifyProjectClientChanged(projectId, 'closed');
  return { closed: false, reason: 'Project client is not opened in this Electron process.' };
});

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  await startPackagedService();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
