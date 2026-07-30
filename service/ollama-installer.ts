import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { defaultOllamaBaseUrl, getOllamaStatus } from './ollama-client.js';
import type { OllamaSetupStatus } from './types.js';

const execFileAsync = promisify(execFile);
export const defaultCoderModel = 'qwen2.5-coder:7b';

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
    baseUrl: defaultOllamaBaseUrl,
    modelId: defaultCoderModel,
    modelInstalled: runtime.models.some((item) => item.name === defaultCoderModel),
    models: runtime.models,
    message: '',
  };
}
