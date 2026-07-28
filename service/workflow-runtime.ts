import { randomUUID } from 'node:crypto';
import { nowText, storagePaths } from './config.js';
import { startAgentRun } from './agent-runtime.js';
import { dataPath, readJson, writeJsonAtomic } from './storage.js';
import type { ProjectRecord, WorkflowSnapshot, WorkflowStageKey, WorkflowStageRecord } from './types.js';
import type { AgentRecord, ModelRecord, WorkflowCapabilityReport } from './types.js';
import { existsSync } from 'node:fs';
import { getOllamaStatus } from './ollama-client.js';

const stageDefinitions: Array<Pick<WorkflowStageRecord, 'key' | 'title' | 'agentId' | 'requiresApproval' | 'input'>> = [
  { key: 'requirements', title: '需求分析', agentId: 'a-requirement', requiresApproval: true, input: '生成完整 PRD、页面功能、角色权限、业务流程、验收标准和待确认问题。' },
  { key: 'architecture', title: '架构设计', agentId: 'a-architecture', requiresApproval: true, input: '根据已确认 PRD 生成技术选型、系统架构、目录结构、接口契约、数据模型和风险清单。' },
  { key: 'planning', title: '开发计划', agentId: 'a-file-split', requiresApproval: true, input: '根据架构方案生成可执行开发计划、模块顺序、文件拆分、组件职责、依赖关系和验收节点。' },
  { key: 'frontend', title: '前端开发', agentId: 'a-frontend', requiresApproval: true, input: '根据确认的计划输出前端文件级实现方案和代码变更清单。' },
  { key: 'backend', title: '后端开发', agentId: 'a-backend', requiresApproval: true, input: '根据确认的计划输出后端文件级实现方案、接口和数据读写清单。' },
  { key: 'review', title: '代码审核', agentId: 'a-review', requiresApproval: false, input: '审核当前项目代码，列出阻断问题、一般问题、引用异常和测试缺口。' },
  { key: 'debug', title: '调试修复', agentId: 'a-debug', requiresApproval: false, input: '根据当前代码、运行日志和审核结果给出最小修复方案与回归步骤。' },
  { key: 'test', title: '测试构建', agentId: 'a-test-build', requiresApproval: false, input: '生成并执行本地测试、Lint、构建和验收检查清单。' },
  { key: 'docs', title: '交付文档', agentId: 'a-docs', requiresApproval: false, input: '整理项目说明、开发文档、接口说明、运行构建方式和交付报告。' },
];

function createStages(): WorkflowStageRecord[] {
  return stageDefinitions.map((item) => ({ ...item, status: 'pending', output: '', runId: '', error: '', updatedAt: '', confirmedAt: '' }));
}

async function readSnapshots() {
  return readJson<WorkflowSnapshot[]>(storagePaths.workflowSnapshots, []);
}

async function saveSnapshot(snapshot: WorkflowSnapshot) {
  const snapshots = await readSnapshots();
  await writeJsonAtomic(dataPath(storagePaths.workflowSnapshots), [snapshot, ...snapshots.filter((item) => item.projectId !== snapshot.projectId)]);
  return snapshot;
}

export async function getWorkflow(projectId: string) {
  const snapshots = await readSnapshots();
  const existing = snapshots.find((item) => item.projectId === projectId);
  if (existing) return existing;
  const projects = await readJson<ProjectRecord[]>(storagePaths.projects, []);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const now = nowText();
  return saveSnapshot({
    id: `wf-${randomUUID()}`,
    projectId,
    projectName: project.name,
    activeStage: 'requirements',
    autoMode: true,
    autoApproveSeconds: 30,
    stages: createStages(),
    createdAt: now,
    updatedAt: now,
  });
}

function findStage(snapshot: WorkflowSnapshot, stageKey: WorkflowStageKey) {
  const stage = snapshot.stages.find((item) => item.key === stageKey);
  if (!stage) throw new Error('工作流节点不存在');
  return stage;
}

export async function runWorkflowStage(projectId: string, stageKey: WorkflowStageKey, customInput?: string) {
  const capability = (await getWorkflowCapabilities(projectId)).stages.find((item) => item.stageKey === stageKey);
  if (capability && !capability.available) throw new Error(capability.reasons.join('；'));
  let snapshot = await getWorkflow(projectId);
  const stage = findStage(snapshot, stageKey);
  const context = snapshot.stages
    .filter((item) => item.output && item.key !== stageKey)
    .map((item) => `【${item.title}产物】\n${item.output}`)
    .join('\n\n');
  const input = [customInput?.trim() || stage.input, context].filter(Boolean).join('\n\n');
  snapshot = await saveSnapshot({
    ...snapshot,
    activeStage: stageKey,
    updatedAt: nowText(),
    stages: snapshot.stages.map((item) => item.key === stageKey ? { ...item, status: 'running', input, error: '', updatedAt: nowText() } : item),
  });
  const run = await startAgentRun({ projectId, agentId: stage.agentId, input });
  const status = run.status === 'success' ? (stage.requiresApproval ? 'review' : 'approved') : 'failed';
  return saveSnapshot({
    ...snapshot,
    updatedAt: nowText(),
    stages: snapshot.stages.map((item) => item.key === stageKey ? {
      ...item,
      status,
      output: run.output,
      runId: run.id,
      error: run.error,
      updatedAt: nowText(),
      confirmedAt: status === 'approved' ? nowText() : '',
    } : item),
  });
}

export async function updateWorkflowStage(projectId: string, stageKey: WorkflowStageKey, output: string) {
  const snapshot = await getWorkflow(projectId);
  findStage(snapshot, stageKey);
  return saveSnapshot({ ...snapshot, updatedAt: nowText(), stages: snapshot.stages.map((item) => item.key === stageKey ? { ...item, output, updatedAt: nowText() } : item) });
}

export async function approveWorkflowStage(projectId: string, stageKey: WorkflowStageKey) {
  const snapshot = await getWorkflow(projectId);
  const stage = findStage(snapshot, stageKey);
  if (!stage.output) throw new Error('当前节点没有可确认的产物');
  const index = snapshot.stages.findIndex((item) => item.key === stageKey);
  const nextStage = snapshot.stages[index + 1];
  return saveSnapshot({
    ...snapshot,
    activeStage: nextStage?.key ?? stageKey,
    updatedAt: nowText(),
    stages: snapshot.stages.map((item) => item.key === stageKey ? { ...item, status: 'approved', confirmedAt: nowText(), updatedAt: nowText() } : item),
  });
}

export async function updateWorkflowMode(projectId: string, autoMode: boolean) {
  const snapshot = await getWorkflow(projectId);
  return saveSnapshot({ ...snapshot, autoMode, updatedAt: nowText() });
}

export async function getWorkflowCapabilities(projectId: string): Promise<WorkflowCapabilityReport> {
  const [snapshot, projects, agents, models] = await Promise.all([
    getWorkflow(projectId),
    readJson<ProjectRecord[]>(storagePaths.projects, []),
    readJson<AgentRecord[]>(storagePaths.agents, []),
    readJson<ModelRecord[]>(storagePaths.models, []),
  ]);
  const project = projects.find((item) => item.id === projectId);
  const projectPathAvailable = Boolean(project?.rootPath && existsSync(project.rootPath));
  let ollamaRunning = true;
  let installedModels = new Set<string>();
  try {
    const status = await getOllamaStatus();
    ollamaRunning = status.running;
    installedModels = new Set(status.models.map((item) => item.name));
  } catch {
    ollamaRunning = false;
  }
  const stages = snapshot.stages.map((stage) => {
    const reasons: string[] = [];
    const agent = agents.find((item) => item.id === stage.agentId);
    if (!agent) reasons.push(`缺少 ${stage.agentId}`);
    else if (!agent.enabled) reasons.push(`${agent.name} 未启用`);
    const model = agent ? models.find((item) => item.name === agent.modelName && item.enabled) : undefined;
    if (agent && !model) reasons.push(`Agent 绑定模型“${agent.modelName}”不存在或未启用`);
    if (model?.provider === 'Ollama' && (!ollamaRunning || !installedModels.has(model.modelId))) reasons.push(`本地模型 ${model.modelId} 未运行或未安装`);
    if (!projectPathAvailable && ['frontend', 'backend', 'review', 'debug', 'test', 'docs'].includes(stage.key)) reasons.push('项目路径不存在');
    return { stageKey: stage.key, agentId: stage.agentId, available: reasons.length === 0, reasons };
  });
  return { projectId, projectPathAvailable, stages, ready: stages.every((item) => item.available) };
}
