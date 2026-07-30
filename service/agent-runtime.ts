import { randomUUID } from 'node:crypto';
import { nowText, storagePaths } from './config.js';
import { createDefaultAgents } from './default-agents.js';
import { generateWithModel, normalizeModelError } from './model-client.js';
import { readProjectFileTree } from './project-files.js';
import { buildProjectSourceContext } from './project-context.js';
import { createRecoveryItem } from './recovery-runtime.js';
import { appendLog, dataPath, readJson, writeAgentFiles, writeJsonAtomic } from './storage.js';
import type { AgentRecord, AgentRunLog, AgentRunRecord, ModelRecord, ProjectRecord } from './types.js';

type StartAgentRunInput = {
  projectId: string;
  agentId: string;
  input: string;
  structured?: boolean;
};

function pushRunLog(logs: AgentRunLog[], runId: string, level: AgentRunLog['level'], text: string) {
  logs.push({
    id: `arl-${randomUUID()}`,
    runId,
    level,
    text,
    createdAt: nowText(),
  });
}

function flattenFileNames(nodes: Awaited<ReturnType<typeof readProjectFileTree>>, limit = 30): string[] {
  const result: string[] = [];
  const walk = (items: typeof nodes) => {
    for (const item of items) {
      if (result.length >= limit) return;
      result.push(`${item.type === 'directory' ? '目录' : '文件'}：${item.path || item.name}`);
      if (item.children) walk(item.children);
    }
  };
  walk(nodes);
  return result;
}

async function buildPrompt(project: ProjectRecord, input: string, structured = false, includeSource = false) {
  let fileSummary = '当前项目目录不可读取或为空。';
  try {
    const files = flattenFileNames(await readProjectFileTree(project));
    fileSummary = files.length > 0 ? files.join('\n') : '当前项目目录为空，尚未生成代码文件。';
  } catch (error) {
    fileSummary = `当前项目目录读取失败：${error instanceof Error ? error.message : String(error)}`;
  }

  let sourceContext = '';
  if (includeSource) {
    const context = await buildProjectSourceContext(project);
    sourceContext = context.text
      ? `关键源码上下文（${context.includedFiles}/${context.totalFiles} 个文件${context.truncated ? '，已按预算截断' : ''}）：\n${context.text}`
      : '关键源码上下文：当前没有可读取的文本源码。';
  }

  return [
    `项目名称：${project.name}`,
    `项目类型：${project.shape} / ${project.deviceType}`,
    `业务类型：${project.businessType || '-'}`,
    `Git 地址：${project.gitRemote || '-'}`,
    `服务器地址：${project.serverUrl || '-'}`,
    `服务端技术栈：${project.serverFramework || '-'}`,
    `服务端目录：${project.serverRootPath || '-'}`,
    `服务端运行命令：${project.serverDevCommand || '-'}`,
    `服务端构建命令：${project.serverBuildCommand || '-'}`,
    `服务端测试命令：${project.serverTestCommand || '-'}`,
    `数据库：${project.databaseType || '-'} / ${project.databaseHost || '-'}:${project.databasePort || '-'} / ${project.databaseName || '-'}`,
    `数据库账号：${project.databaseUsername || '-'}`,
    `数据库密码：${project.databasePasswordConfigured ? '已安全配置，不向 Agent 明文暴露' : '未配置'}`,
    `项目介绍：${project.description || '-'}`,
    `原始需求：${project.requirement || '-'}`,
    `硬性约束：${project.constraints || '-'}`,
    '当前文件概况：',
    fileSummary,
    ...(sourceContext ? ['', sourceContext] : []),
    '',
    '用户当前任务：',
    input,
    '',
    ...(structured ? ['必须严格按照用户当前任务指定的 JSON Schema 输出，不要输出 Markdown 代码块或额外说明。', ''] : ['请输出：', '1. 结论摘要', '2. 详细执行内容', '3. 风险与需要用户确认的事项', '4. 下一步建议', '']),
    '硬性约束：',
    '- 不得编造当前项目中不存在的代码、文件、依赖或错误。',
    ...(structured
      ? ['- 如果任务明确要求初始化或生成代码，项目目录为空时允许创建新文件，但不得声称这些文件原本存在。']
      : ['- 如果项目目录为空，请明确说明只能做规划或审核标准，不能假装已经完成代码审核。']),
    '- 涉及技术选型、数据库、生产部署、删除数据、安全策略、Git 分支等事项必须标注需要用户确认。',
  ].join('\n');
}

function pickModel(models: ModelRecord[], agent: AgentRecord, project: ProjectRecord) {
  if (project.modelName) {
    return models.find((item) => item.name === project.modelName && item.enabled);
  }
  return (
    models.find((item) => item.name === agent.modelName && item.enabled) ??
    models.find((item) => item.provider.toLowerCase().includes('ollama') && item.enabled) ??
    models.find((item) => item.enabled)
  );
}

export async function ensureDefaultAgents(modelName: string) {
  const agents = await readJson<AgentRecord[]>(storagePaths.agents, []);
  const defaults = createDefaultAgents(modelName);
  const defaultIds = new Set(defaults.map((item) => item.id));
  const defaultNames = new Set(defaults.map((item) => item.name));
  const matchedIds = new Set<string>();
  let updated = 0;
  const synchronized = agents.map((agent) => {
    const preset = defaults.find((item) => item.id === agent.id || item.name === agent.name);
    if (!preset) return agent;
    matchedIds.add(preset.id);
    const next: AgentRecord = {
      ...agent,
      id: preset.id,
      name: preset.name,
      category: preset.category,
      description: preset.description,
      prompt: preset.prompt,
      permissions: preset.permissions,
      approvalRules: preset.approvalRules,
      contextRules: preset.contextRules,
      outputFormat: preset.outputFormat,
      qualityGates: preset.qualityGates,
      modelName: agent.modelName || modelName,
      enabled: agent.enabled,
    };
    if (JSON.stringify(next) !== JSON.stringify(agent)) updated += 1;
    return next;
  });
  const missing = defaults.filter((item) => !matchedIds.has(item.id));
  const customAgents = synchronized.filter(
    (agent) => !defaultIds.has(agent.id) && !defaultNames.has(agent.name),
  );
  const synchronizedDefaults = defaults.map(
    (preset) => synchronized.find((agent) => agent.id === preset.id) ?? preset,
  );
  const merged = [...synchronizedDefaults, ...customAgents];
  await writeJsonAtomic(dataPath(storagePaths.agents), merged);
  await Promise.all(merged.map(writeAgentFiles));
  await appendLog({
    type: '系统日志',
    level: 'info',
    projectName: '全局',
    title: '默认 Agent 已同步',
    detail: `新增 ${missing.length} 个，更新 ${updated} 个默认 Agent`,
  });
  return { created: missing.length, updated, total: merged.length };
}

export async function listAgentRuns(projectId?: string) {
  const runs = await readJson<AgentRunRecord[]>(storagePaths.agentRuns, []);
  return projectId ? runs.filter((item) => item.projectId === projectId) : runs;
}

export async function readAgentRunLogs(runId: string) {
  const logs = await readJson<AgentRunLog[]>(storagePaths.agentRunLogs, []);
  return logs.filter((item) => item.runId === runId);
}

export async function startAgentRun(input: StartAgentRunInput) {
  const [projects, agents, models, runs, logs] = await Promise.all([
    readJson<ProjectRecord[]>(storagePaths.projects, []),
    readJson<AgentRecord[]>(storagePaths.agents, []),
    readJson<ModelRecord[]>(storagePaths.models, []),
    readJson<AgentRunRecord[]>(storagePaths.agentRuns, []),
    readJson<AgentRunLog[]>(storagePaths.agentRunLogs, []),
  ]);

  const project = projects.find((item) => item.id === input.projectId);
  if (!project) {
    throw new Error('项目不存在');
  }

  const agent = agents.find((item) => item.id === input.agentId && item.enabled);
  if (!agent) {
    throw new Error('Agent 不存在或未启用');
  }

  const model = pickModel(models, agent, project);
  if (!model) {
    throw new Error('未找到可用模型配置');
  }

  const run: AgentRunRecord = {
    id: `ar-${randomUUID()}`,
    projectId: project.id,
    projectName: project.name,
    agentId: agent.id,
    agentName: agent.name,
    modelName: model.name,
    modelId: model.modelId,
    status: 'running',
    input: input.input,
    output: '',
    error: '',
    startedAt: nowText(),
    endedAt: '',
  };

  const nextRuns = [run, ...runs];
  pushRunLog(logs, run.id, 'info', `Agent ${agent.name} 开始执行，模型：${model.modelId}`);
  await writeJsonAtomic(dataPath(storagePaths.agentRuns), nextRuns);
  await writeJsonAtomic(dataPath(storagePaths.agentRunLogs), logs);

  try {
    const result = await generateWithModel({
      model,
      system: [
        agent.prompt,
        `上下文使用规则：\n${(agent.contextRules ?? []).map((item) => `- ${item}`).join('\n') || '- 仅使用当前任务提供的可靠上下文。'}`,
        `输出规范：\n${agent.outputFormat || '输出清晰、可执行的结构化结果。'}`,
        `质量门禁：\n${(agent.qualityGates ?? []).map((item) => `- ${item}`).join('\n') || '- 输出前检查事实、完整性和风险。'}`,
      ].join('\n\n'),
      prompt: await buildPrompt(project, input.input, input.structured, ['前端开发', '后端开发', '代码审核', '调试修复', '测试构建'].includes(agent.category)),
      json: input.structured,
    });

    const completed: AgentRunRecord = {
      ...run,
      status: 'success',
      output: result.text,
      endedAt: nowText(),
    };
    const latestRuns = await readJson<AgentRunRecord[]>(storagePaths.agentRuns, []);
    const latestLogs = await readJson<AgentRunLog[]>(storagePaths.agentRunLogs, []);
    pushRunLog(latestLogs, run.id, 'info', `Agent 执行完成，输出长度：${result.text.length}`);
    await writeJsonAtomic(
      dataPath(storagePaths.agentRuns),
      latestRuns.map((item) => (item.id === run.id ? completed : item)),
    );
    await writeJsonAtomic(dataPath(storagePaths.agentRunLogs), latestLogs);
    await appendLog({
      type: '任务日志',
      level: 'info',
      projectName: project.name,
      title: `${agent.name} 执行完成`,
      detail: `runId=${run.id}`,
    });
    return completed;
  } catch (error) {
    const failed: AgentRunRecord = {
      ...run,
      status: 'failed',
      error: normalizeModelError(error, model),
      endedAt: nowText(),
    };
    const latestRuns = await readJson<AgentRunRecord[]>(storagePaths.agentRuns, []);
    const latestLogs = await readJson<AgentRunLog[]>(storagePaths.agentRunLogs, []);
    pushRunLog(latestLogs, run.id, 'error', failed.error);
    await writeJsonAtomic(
      dataPath(storagePaths.agentRuns),
      latestRuns.map((item) => (item.id === run.id ? failed : item)),
    );
    await writeJsonAtomic(dataPath(storagePaths.agentRunLogs), latestLogs);
    await appendLog({
      type: '任务日志',
      level: 'error',
      projectName: project.name,
      title: `${agent.name} 执行失败`,
      detail: failed.error,
    });
    await createRecoveryItem({ type: '失败任务', projectName: project.name, title: `${agent.name} 执行失败`, detail: failed.error, severity: '中' });
    return failed;
  }
}
