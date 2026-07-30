import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultDataDir, nowText, storagePaths } from './config.js';
import { createSeedSettings, seedAgentUsage, seedAgents, seedLogs, seedModelUsage, seedModels, seedProjects, seedRecovery } from './seeds.js';
import type { AgentRecord, LogRecord } from './types.js';

export function dataPath(relativePath: string) {
  return path.join(defaultDataDir, relativePath);
}

export async function writeJsonAtomic(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempFile, file);
}

export async function readJson<T>(relativePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(dataPath(relativePath), 'utf8')) as T;
  } catch {
    await writeJsonAtomic(dataPath(relativePath), fallback);
    return fallback;
  }
}

function containsLegacyMojibake(value: unknown) {
  const text = JSON.stringify(value);
  return /涓|鍏|绾|鏃|椤|妯|璇|鍓|閰|瀵|浣/.test(text);
}

export async function readMigratedJson<T>(relativePath: string, fallback: T): Promise<T> {
  const value = await readJson(relativePath, fallback);
  if (containsLegacyMojibake(value)) {
    await writeJsonAtomic(dataPath(relativePath), fallback);
    return fallback;
  }
  return value;
}

export async function appendLog(input: Omit<LogRecord, 'id' | 'createdAt'>) {
  const log: LogRecord = { id: `l-${randomUUID()}`, createdAt: nowText(), ...input };
  const month = new Date().toISOString().slice(0, 7);
  const file = dataPath(`logs/system-${month}.jsonl`);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(log)}\n`, 'utf8');
}

export async function readLogs(): Promise<LogRecord[]> {
  const logsDir = dataPath('logs');
  try {
    const files = (await readdir(logsDir)).filter((file) => file.endsWith('.jsonl')).sort().reverse();
    const rows = await Promise.all(
      files.map(async (file) => {
        const text = await readFile(path.join(logsDir, file), 'utf8');
        return text
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as LogRecord);
      }),
    );
    return rows.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    await Promise.all(seedLogs.map(({ id: _id, createdAt: _createdAt, ...item }) => appendLog(item)));
    return seedLogs;
  }
}

export async function writeAgentFiles(agent: AgentRecord) {
  const dir = dataPath(`agents/custom/${agent.id}`);
  await writeJsonAtomic(path.join(dir, 'profile.json'), {
    id: agent.id,
    name: agent.name,
    category: agent.category,
    modelName: agent.modelName,
    risk: agent.risk,
    enabled: agent.enabled,
    description: agent.description,
    permissions: agent.permissions,
    approvalRules: agent.approvalRules,
    contextRules: agent.contextRules,
    qualityGates: agent.qualityGates,
  });
  await writeFile(path.join(dir, 'prompt.md'), agent.prompt || '', 'utf8');
  await writeJsonAtomic(path.join(dir, 'schema.json'), { output: agent.outputFormat, strict: true });
  await writeJsonAtomic(path.join(dir, 'workflow.json'), {
    approvalRequired: agent.approvalRules,
    toolPermissions: agent.permissions,
    contextRules: agent.contextRules,
    qualityGates: agent.qualityGates,
  });
}

function normalizeStoredAgent(agent: AgentRecord): AgentRecord {
  return {
    ...agent,
    permissions: Array.isArray(agent.permissions) ? agent.permissions : [],
    approvalRules: Array.isArray(agent.approvalRules) ? agent.approvalRules : [],
    contextRules: Array.isArray(agent.contextRules)
      ? agent.contextRules
      : ['仅使用当前项目和任务相关上下文', '信息不足时明确列出待确认项，不得编造'],
    outputFormat: agent.outputFormat || '输出结论、执行内容、风险、验证结果和下一步。',
    qualityGates: Array.isArray(agent.qualityGates)
      ? agent.qualityGates
      : ['输出与用户需求一致', '高风险操作已标记人工确认', '不存在无法验证的完成声明'],
  };
}

export async function bootstrapStorage() {
  await Promise.all([
    mkdir(dataPath('system'), { recursive: true }),
    mkdir(dataPath('projects'), { recursive: true }),
    mkdir(dataPath('models'), { recursive: true }),
    mkdir(dataPath('agents/custom'), { recursive: true }),
    mkdir(dataPath('settings'), { recursive: true }),
    mkdir(dataPath('recovery'), { recursive: true }),
    mkdir(dataPath('analytics'), { recursive: true }),
    mkdir(dataPath('logs'), { recursive: true }),
  ]);

  await readJson(storagePaths.appConfig, { appName: 'Frontend Agent Admin', version: '0.1.0', storageVersion: 1 });
  await readJson(storagePaths.pathConfig, {
    dataDir: defaultDataDir,
    configDir: dataPath('system'),
    logDir: dataPath('logs'),
  });
  await readMigratedJson(storagePaths.projects, seedProjects);
  await readJson(storagePaths.projectSecrets, []);
  await readMigratedJson(storagePaths.models, seedModels);
  const storedAgents = await readMigratedJson(storagePaths.agents, seedAgents);
  const agents = storedAgents
    .filter((agent) => agent.id !== 'a-orchestrator' && agent.category !== '主调度' && !/总调度/.test(agent.name))
    .map(normalizeStoredAgent);
  if (JSON.stringify(agents) !== JSON.stringify(storedAgents)) {
    await writeJsonAtomic(dataPath(storagePaths.agents), agents);
  }
  await Promise.all(agents.map(writeAgentFiles));
  await readJson(storagePaths.agentRuns, []);
  await readJson(storagePaths.agentRunLogs, []);
  await readJson(storagePaths.projectAgentPlans, []);
  await readJson(storagePaths.workflowSnapshots, []);
  await readJson(storagePaths.workflowHistory, []);
  await readJson(storagePaths.fileChanges, []);
  await readJson(storagePaths.projectTasks, []);
  await readJson(storagePaths.projectTaskLogs, []);
  await readJson(storagePaths.validations, []);
  await readMigratedJson(storagePaths.settings, createSeedSettings(defaultDataDir));
  await readMigratedJson(storagePaths.recovery, seedRecovery);
  await readMigratedJson(storagePaths.modelUsage, seedModelUsage);
  await readMigratedJson(storagePaths.agentUsage, seedAgentUsage);
  await readLogs();
}
