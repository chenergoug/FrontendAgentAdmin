import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { nowText, storagePaths } from './config.js';
import { appendLog, dataPath, readJson, writeJsonAtomic } from './storage.js';
import { stripAnsi } from './text-utils.js';
import type { ProjectRecord, ProjectTaskLog, ProjectTaskRecord, ProjectTaskStatus, ProjectTaskType } from './types.js';

type RunningTask = {
  process: ChildProcessWithoutNullStreams;
  record: ProjectTaskRecord;
  logs: ProjectTaskLog[];
};

const tasks = new Map<string, RunningTask>();
const history: ProjectTaskRecord[] = [];
const logsByTask = new Map<string, ProjectTaskLog[]>();
const waiters = new Map<string, (record: ProjectTaskRecord) => void>();
let persistQueue = Promise.resolve();

async function persistTaskState() {
  await writeJsonAtomic(dataPath(storagePaths.projectTasks), history);
  await writeJsonAtomic(dataPath(storagePaths.projectTaskLogs), Array.from(logsByTask.values()).flat());
}

function schedulePersistTaskState() {
  persistQueue = persistQueue.then(persistTaskState).catch((error) => console.error('Persist task state failed:', error));
}

async function hydrateTaskState() {
  if (history.length > 0 || logsByTask.size > 0) return;
  const [savedTasks, savedLogs] = await Promise.all([
    readJson<ProjectTaskRecord[]>(storagePaths.projectTasks, []),
    readJson<ProjectTaskLog[]>(storagePaths.projectTaskLogs, []),
  ]);
  history.push(...savedTasks.map((item) => item.status === 'running' ? { ...item, status: 'failed' as const, endedAt: nowText() } : item));
  savedLogs.forEach((log) => logsByTask.set(log.taskId, [...(logsByTask.get(log.taskId) ?? []), { ...log, text: stripAnsi(log.text) }]));
}

await hydrateTaskState();

function appendTaskLog(task: RunningTask, stream: ProjectTaskLog['stream'], text: string) {
  const log: ProjectTaskLog = {
    id: `tl-${randomUUID()}`,
    taskId: task.record.id,
    stream,
    text: stripAnsi(text),
    createdAt: nowText(),
  };
  task.logs.push(log);
  logsByTask.set(task.record.id, task.logs);
  schedulePersistTaskState();
}

function getCommand(project: ProjectRecord, type: ProjectTaskType, command?: string) {
  if (command?.trim()) return command.trim();
  const commands: Record<ProjectTaskType, string> = {
    dev: project.devCommand,
    build: project.buildCommand,
    lint: project.lintCommand,
    test: project.testCommand,
  };
  return commands[type]?.trim() ?? '';
}

function finishTask(task: RunningTask, status: ProjectTaskStatus, exitCode: number | null) {
  task.record.status = status;
  task.record.exitCode = exitCode;
  task.record.endedAt = nowText();
  tasks.delete(task.record.id);
  logsByTask.set(task.record.id, task.logs);
  schedulePersistTaskState();
  waiters.get(task.record.id)?.(task.record);
  waiters.delete(task.record.id);
  void appendLog({
    type: '任务日志',
    level: status === 'success' ? 'info' : status === 'stopped' ? 'warning' : 'error',
    projectName: task.record.projectName,
    title: `任务${status === 'success' ? '执行成功' : status === 'stopped' ? '已停止' : '执行失败'}`,
    detail: `${task.record.type}: ${task.record.command}`,
  });
}

export async function listProjectTasks(projectId: string) {
  await hydrateTaskState();
  return history
    .filter((task) => task.projectId === projectId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readTaskLogs(taskId: string) {
  await hydrateTaskState();
  return (logsByTask.get(taskId) ?? []).map((log) => ({ ...log, text: stripAnsi(log.text) }));
}

export function startProjectTask(project: ProjectRecord, type: ProjectTaskType, command?: string) {
  const taskCommand = getCommand(project, type, command);
  if (!taskCommand) {
    throw new Error('项目命令未配置');
  }
  if (!project.rootPath || !existsSync(project.rootPath)) {
    throw new Error('项目路径不存在，无法执行任务');
  }

  const sameRunning = history.find((task) => task.projectId === project.id && task.type === type && task.status === 'running');
  if (sameRunning) {
    throw new Error('同一项目同一类型任务正在运行中');
  }

  const record: ProjectTaskRecord = {
    id: `task-${randomUUID()}`,
    projectId: project.id,
    projectName: project.name,
    type,
    command: taskCommand,
    status: 'running',
    startedAt: nowText(),
    endedAt: '',
    exitCode: null,
  };

  const child = spawn(taskCommand, {
    cwd: project.rootPath || process.cwd(),
    shell: true,
    windowsHide: true,
  });
  const task: RunningTask = { process: child, record, logs: [] };
  tasks.set(record.id, task);
  history.unshift(record);
  logsByTask.set(record.id, task.logs);
  schedulePersistTaskState();
  appendTaskLog(task, 'system', `启动命令：${taskCommand}`);

  child.stdout.on('data', (chunk) => appendTaskLog(task, 'stdout', String(chunk)));
  child.stderr.on('data', (chunk) => appendTaskLog(task, 'stderr', String(chunk)));
  child.on('error', (error) => {
    appendTaskLog(task, 'stderr', error.message);
    finishTask(task, 'failed', null);
  });
  child.on('close', (code) => {
    if (record.status !== 'running') return;
    finishTask(task, code === 0 ? 'success' : 'failed', code);
  });

  void appendLog({
    type: '任务日志',
    level: 'info',
    projectName: project.name,
    title: '任务已启动',
    detail: `${type}: ${taskCommand}`,
  });

  return record;
}

export function waitForProjectTask(taskId: string) {
  const existing = history.find((item) => item.id === taskId);
  if (existing && existing.status !== 'running') return Promise.resolve(existing);
  return new Promise<ProjectTaskRecord>((resolve) => waiters.set(taskId, resolve));
}

export function stopProjectTask(projectId: string, taskId: string) {
  const task = tasks.get(taskId);
  if (!task || task.record.projectId !== projectId) {
    throw new Error('任务不存在或已结束');
  }

  appendTaskLog(task, 'system', '用户请求停止任务');
  task.record.status = 'stopped';
  task.process.kill();
  finishTask(task, 'stopped', null);
  return task.record;
}
