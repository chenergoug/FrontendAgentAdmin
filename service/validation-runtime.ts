import { randomUUID } from 'node:crypto';
import { nowText, storagePaths } from './config.js';
import { dataPath, readJson, writeJsonAtomic } from './storage.js';
import { readTaskLogs, startProjectTask, waitForProjectTask } from './task-manager.js';
import { approveWorkflowStage, updateWorkflowStage } from './workflow-runtime.js';
import type { ProjectRecord, ProjectTaskType, ProjectValidationRecord } from './types.js';
import { createRecoveryItem } from './recovery-runtime.js';

const activeValidationIds = new Set<string>();

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
  for (const type of ['lint', 'test', 'build'] as ProjectTaskType[]) {
    record = await saveValidation({ ...record, currentStep: type });
    try {
      const task = startProjectTask(project, type);
      record = await saveValidation({ ...record, taskIds: [...record.taskIds, task.id] });
      const completed = await waitForProjectTask(task.id);
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
