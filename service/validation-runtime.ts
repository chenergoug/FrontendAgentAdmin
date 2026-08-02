import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { nowText, storagePaths } from './config.js';
import { dataPath, readJson, writeJsonAtomic } from './storage.js';
import { readTaskLogs, startProjectTask, waitForProjectTask } from './task-manager.js';
import { approveWorkflowStage, updateWorkflowStage } from './workflow-runtime.js';
import type { ProjectRecord, ProjectTaskType, ProjectValidationRecord } from './types.js';
import { createRecoveryItem } from './recovery-runtime.js';

const activeValidationIds = new Set<string>();

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function packageManager(rootPath: string) {
  if (existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(rootPath, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(rootPath, 'bun.lockb')) || existsSync(path.join(rootPath, 'bun.lock'))) return 'bun';
  return 'npm';
}

function inDirectory(projectRoot: string, commandRoot: string, command: string) {
  if (path.resolve(projectRoot) === path.resolve(commandRoot)) return command;
  return `cd ${JSON.stringify(path.relative(projectRoot, commandRoot))} && ${command}`;
}

function hasPackageDependencies(root: string) {
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as PackageManifest;
    return Object.keys(manifest.dependencies ?? {}).length > 0 || Object.keys(manifest.devDependencies ?? {}).length > 0;
  } catch {
    return false;
  }
}

function dependencyInstallCommands(project: ProjectRecord) {
  if (!project.rootPath || !existsSync(project.rootPath)) return [];
  const roots = [
    project.rootPath,
    path.join(project.rootPath, 'frontend'),
    path.join(project.rootPath, 'client'),
    path.join(project.rootPath, 'app'),
  ];
  return [...new Set(roots)]
    .filter((root) => existsSync(path.join(root, 'package.json')) && hasPackageDependencies(root) && !existsSync(path.join(root, 'node_modules')))
    .map((root) => inDirectory(project.rootPath, root, `${packageManager(root)} install`));
}

async function saveValidation(record: ProjectValidationRecord) {
  const all = await readJson<ProjectValidationRecord[]>(storagePaths.validations, []);
  await writeJsonAtomic(dataPath(storagePaths.validations), [record, ...all.filter((item) => item.id !== record.id)]);
  return record;
}

export async function listValidations(projectId: string) {
  const all = await readJson<ProjectValidationRecord[]>(storagePaths.validations, []);
  let changed = false;
  const recovered = all.map((item) => {
    if (item.status !== 'running' || activeValidationIds.has(item.id)) return item;
    changed = true;
    return { ...item, status: 'failed' as const, report: `${item.report}\n\n服务异常退出，验证任务已中断。`.trim(), endedAt: nowText() };
  });
  if (changed) await writeJsonAtomic(dataPath(storagePaths.validations), recovered);
  return recovered.filter((item) => item.projectId === projectId);
}

export async function startValidation(project: ProjectRecord) {
  const running = (await listValidations(project.id)).find((item) => item.status === 'running');
  if (running) throw new Error('该项目正在执行一键验证');
  const record: ProjectValidationRecord = {
    id: `pv-${randomUUID()}`, projectId: project.id, projectName: project.name, status: 'running', currentStep: 'lint', taskIds: [], report: '', startedAt: nowText(), endedAt: '',
  };
  await saveValidation(record);
  activeValidationIds.add(record.id);
  void executeValidation(project, record).finally(() => activeValidationIds.delete(record.id));
  return record;
}

async function executeValidation(project: ProjectRecord, initial: ProjectValidationRecord) {
  let record = initial;
  const reports: string[] = [];
  const installCommands = dependencyInstallCommands(project);
  if (installCommands.length > 0) {
    for (const command of installCommands) {
      try {
        const task = startProjectTask(project, 'test', command);
        record = await saveValidation({ ...record, taskIds: [...record.taskIds, task.id] });
        const completed = await waitForProjectTask(task.id, 5 * 60 * 1000);
        const logs = await readTaskLogs(task.id);
        reports.push(`## dependencies\n状态：${completed.status}\n${logs.map((item) => item.text).join('')}`);
        if (completed.status !== 'success') {
          record = await saveValidation({ ...record, status: 'failed', currentStep: 'test', report: reports.join('\n\n'), endedAt: nowText() });
          await updateWorkflowStage(project.id, 'test', record.report);
          await createRecoveryItem({ type: '失败任务', projectName: project.name, title: '项目依赖安装失败', detail: record.report, severity: '中' });
          return;
        }
      } catch (error) {
        reports.push(`## dependencies\n启动失败：${error instanceof Error ? error.message : String(error)}`);
        record = await saveValidation({ ...record, status: 'failed', currentStep: 'test', report: reports.join('\n\n'), endedAt: nowText() });
        await updateWorkflowStage(project.id, 'test', record.report);
        await createRecoveryItem({ type: '失败任务', projectName: project.name, title: '项目依赖安装启动失败', detail: record.report, severity: '中' });
        return;
      }
    }
  } else {
    reports.push('## dependencies\n状态：skipped\n未发现需要安装的 Node 依赖，或依赖已安装。');
  }
  for (const type of ['lint', 'test', 'build'] as ProjectTaskType[]) {
    record = await saveValidation({ ...record, currentStep: type });
    try {
      const task = startProjectTask(project, type);
      record = await saveValidation({ ...record, taskIds: [...record.taskIds, task.id] });
      const completed = await waitForProjectTask(task.id, 5 * 60 * 1000);
      const logs = await readTaskLogs(task.id);
      reports.push(`## ${type}\n状态：${completed.status}\n${logs.map((item) => item.text).join('')}`);
      if (completed.status !== 'success') {
        record = await saveValidation({ ...record, status: 'failed', currentStep: type, report: reports.join('\n\n'), endedAt: nowText() });
        await updateWorkflowStage(project.id, 'test', record.report);
        await createRecoveryItem({ type: '失败任务', projectName: project.name, title: '项目一键验证失败', detail: record.report, severity: '中' });
        return;
      }
    } catch (error) {
      reports.push(`## ${type}\n启动失败：${error instanceof Error ? error.message : String(error)}`);
      record = await saveValidation({ ...record, status: 'failed', currentStep: type, report: reports.join('\n\n'), endedAt: nowText() });
      await updateWorkflowStage(project.id, 'test', record.report);
      await createRecoveryItem({ type: '失败任务', projectName: project.name, title: '项目一键验证启动失败', detail: record.report, severity: '中' });
      return;
    }
  }
  record = await saveValidation({ ...record, status: 'success', currentStep: '', report: reports.join('\n\n'), endedAt: nowText() });
  await updateWorkflowStage(project.id, 'test', record.report);
  await approveWorkflowStage(project.id, 'test');
}
