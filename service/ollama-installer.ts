import { execFile, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { defaultOllamaBaseUrl, getOllamaStatus } from './ollama-client.js';
import type { OllamaSetupStatus } from './types.js';

const execFileAsync = promisify(execFile);
export const defaultCoderModel = 'qwen2.5-coder:7b';
let installing = false;

async function existingFile(candidates: string[]) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue checking known installation locations.
    }
  }
  return '';
}

async function findOllamaExecutable() {
  try {
    const command = process.platform === 'win32' ? 'where.exe' : 'which';
    const { stdout } = await execFileAsync(command, ['ollama'], { timeout: 5000 });
    const executable = stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
    if (executable) return executable;
  } catch {
    // Fall back to platform default installation paths.
  }
  if (process.platform === 'win32') {
    return existingFile([
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama.exe'),
      path.join(process.env.PROGRAMFILES ?? '', 'Ollama', 'ollama.exe'),
    ]);
  }
  if (process.platform === 'darwin') {
    return existingFile([
      '/Applications/Ollama.app/Contents/Resources/ollama',
      '/opt/homebrew/bin/ollama',
      '/usr/local/bin/ollama',
    ]);
  }
  return existingFile(['/usr/local/bin/ollama', '/usr/bin/ollama']);
}

async function ollamaVersion(executable: string) {
  if (!executable) return '';
  try {
    const { stdout, stderr } = await execFileAsync(executable, ['--version'], { timeout: 5000 });
    return `${stdout}${stderr}`.trim();
  } catch {
    return '';
  }
}

export async function inspectOllamaSetup(): Promise<OllamaSetupStatus> {
  const executable = await findOllamaExecutable();
  const runtime = await getOllamaStatus(defaultOllamaBaseUrl);
  return {
    supported: process.platform === 'win32' || process.platform === 'darwin',
    platform: process.platform,
    executable,
    installed: Boolean(executable),
    running: runtime.running,
    version: await ollamaVersion(executable),
    modelId: defaultCoderModel,
    modelInstalled: runtime.models.some((item) => item.name === defaultCoderModel),
    models: runtime.models,
    installing,
    message: '',
  };
}

async function installOllama() {
  if (process.platform === 'win32') {
    await execFileAsync('winget.exe', [
      'install', '--id', 'Ollama.Ollama', '--exact', '--silent',
      '--accept-package-agreements', '--accept-source-agreements',
    ], { timeout: 20 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
    return;
  }
  if (process.platform === 'darwin') {
    await execFileAsync('brew', ['install', '--cask', 'ollama'], {
      timeout: 20 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return;
  }
  throw new Error(`当前系统 ${os.platform()} 暂不支持一键安装，请手动安装 Ollama`);
}

async function waitUntilRunning(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await getOllamaStatus(defaultOllamaBaseUrl)).running) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Ollama 已安装，但服务启动超时');
}

export async function installOllamaAndDefaultModel(): Promise<OllamaSetupStatus> {
  if (installing) throw new Error('Ollama 安装任务正在执行，请勿重复提交');
  installing = true;
  try {
    let executable = await findOllamaExecutable();
    if (!executable) {
      await installOllama();
      executable = await findOllamaExecutable();
      if (!executable) throw new Error('安装命令已完成，但未找到 Ollama 可执行文件，请重启客户端后重试');
    }

    let runtime = await getOllamaStatus(defaultOllamaBaseUrl);
    if (!runtime.running) {
      const child = spawn(executable, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      await waitUntilRunning();
      runtime = await getOllamaStatus(defaultOllamaBaseUrl);
    }
    if (!runtime.models.some((item) => item.name === defaultCoderModel)) {
      await execFileAsync(executable, ['pull', defaultCoderModel], {
        timeout: 2 * 60 * 60 * 1000,
        maxBuffer: 20 * 1024 * 1024,
      });
    }
    return { ...(await inspectOllamaSetup()), installing: false, message: 'Ollama 与默认模型安装完成' };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  } finally {
    installing = false;
  }
}
