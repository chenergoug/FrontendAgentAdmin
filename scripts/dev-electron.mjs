import { spawn } from 'node:child_process';

const npm = 'npm';
const children = new Set();
let closing = false;

function start(args) {
  const child = spawn(npm, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  children.add(child);
  child.on('exit', (code) => {
    children.delete(child);
    if (!closing && code && code !== 0) shutdown(code);
  });
  return child;
}

async function waitFor(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The development process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`等待开发服务超时：${url}`);
}

function shutdown(exitCode = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(exitCode), 100);
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

start(['run', 'dev']);
start(['run', 'dev:service']);

try {
  await Promise.all([
    waitFor(process.env.RENDERER_URL || 'http://127.0.0.1:5180'),
    waitFor(`${process.env.SERVICE_URL || 'http://127.0.0.1:3880/api'}/health`),
  ]);
  const electron = start(['run', 'electron:start']);
  electron.on('exit', (code) => shutdown(code ?? 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
