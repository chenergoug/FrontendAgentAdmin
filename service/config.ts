import os from 'node:os';
import path from 'node:path';

export const port = Number(process.env.PORT ?? 3880);
export const host = process.env.SERVICE_HOST ?? '127.0.0.1';

export const defaultDataDir =
  process.env.FRONTEND_AGENT_DATA_DIR ?? path.join(os.homedir(), 'FrontendAgentAdminData');

export const storagePaths = {
  appConfig: 'system/app-config.json',
  pathConfig: 'system/path-config.json',
  projects: 'projects/project-list.json',
  models: 'models/model-list.json',
  agents: 'agents/agent-list.json',
  agentRuns: 'agents/runs.json',
  agentRunLogs: 'agents/run-logs.json',
  workflowSnapshots: 'agents/workflow-snapshots.json',
  fileChanges: 'projects/file-changes.json',
  projectTasks: 'projects/tasks.json',
  projectTaskLogs: 'projects/task-logs.json',
  validations: 'projects/validations.json',
  settings: 'settings/settings.json',
  recovery: 'recovery/recovery-items.json',
  modelUsage: 'analytics/model-usage.json',
  agentUsage: 'analytics/agent-usage.json',
} as const;

export function nowText() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
