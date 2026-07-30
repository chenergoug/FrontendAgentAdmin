import { randomUUID } from 'node:crypto';
import { nowText, storagePaths } from './config.js';
import { startAgentRun } from './agent-runtime.js';
import { dataPath, readJson, writeJsonAtomic } from './storage.js';
import type { ProjectRecord, WorkflowHistoryRecord, WorkflowSnapshot, WorkflowStageKey, WorkflowStageRecord } from './types.js';
import type { AgentRecord, ModelRecord, WorkflowCapabilityReport } from './types.js';
import { existsSync } from 'node:fs';
import { getOllamaStatus } from './ollama-client.js';
import { projectRequirements, resolveRequirementAgent } from './agent-planner.js';

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

const runningStages = new Set<string>();

function createStages(project: ProjectRecord, agents: AgentRecord[], planning = ''): WorkflowStageRecord[] {
  const requirements = projectRequirements(project, planning).filter((item) => item.workflowStageKey);
  return requirements.map((requirement) => {
    const definition = stageDefinitions.find((item) => item.key === requirement.workflowStageKey);
    if (!definition) throw new Error(`工作流节点定义不存在：${requirement.workflowStageKey}`);
    const agent = resolveRequirementAgent(requirement, agents);
    return { ...definition, agentId: agent?.id ?? requirement.agentId, status: 'pending', output: '', runId: '', error: '', updatedAt: '', confirmedAt: '' };
  });
}

async function readSnapshots() {
  return readJson<WorkflowSnapshot[]>(storagePaths.workflowSnapshots, []);
}

async function saveSnapshot(snapshot: WorkflowSnapshot) {
  const snapshots = await readSnapshots();
  await writeJsonAtomic(dataPath(storagePaths.workflowSnapshots), [snapshot, ...snapshots.filter((item) => item.projectId !== snapshot.projectId)]);
  return snapshot;
}

export async function listWorkflowHistory(projectId: string) {
  const history = await readJson<WorkflowHistoryRecord[]>(storagePaths.workflowHistory, []);
  return history
    .filter((item) => item.projectId === projectId)
    .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

export async function getWorkflow(projectId: string) {
  const [snapshots, projects, agents, savedPlans] = await Promise.all([
    readSnapshots(),
    readJson<ProjectRecord[]>(storagePaths.projects, []),
    readJson<AgentRecord[]>(storagePaths.agents, []),
    readJson<Array<{ projectId: string; planning: string }>>(storagePaths.projectAgentPlans, []),
  ]);
  const existing = snapshots.find((item) => item.projectId === projectId);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const planning = savedPlans.find((item) => item.projectId === projectId)?.planning ?? '';
  const desiredStages = createStages(project, agents, planning);
  if (existing) {
    const stages = desiredStages.map((desired) => {
      const previous = existing.stages.find((item) => item.key === desired.key);
      return previous ? { ...previous, title: desired.title, agentId: desired.agentId, requiresApproval: desired.requiresApproval } : desired;
    });
    const activeStage = stages.some((item) => item.key === existing.activeStage)
      ? existing.activeStage
      : stages.find((item) => item.status !== 'approved')?.key ?? stages[0]?.key ?? 'requirements';
    return saveSnapshot({ ...existing, version: existing.version ?? 1, activeStage, stages });
  }
  const now = nowText();
  return saveSnapshot({
    id: `wf-${randomUUID()}`,
    version: 1,
    projectId,
    projectName: project.name,
    activeStage: 'requirements',
    autoMode: true,
    autoApproveSeconds: 30,
    stages: desiredStages,
    createdAt: now,
    updatedAt: now,
  });
}

export async function prepareWorkflowRerun(projectId: string, stageKey: WorkflowStageKey, reason: string) {
  if (!reason.trim()) throw new Error('请填写重新执行原因');
  const snapshot = await getWorkflow(projectId);
  const stageIndex = snapshot.stages.findIndex((item) => item.key === stageKey);
  if (stageIndex < 0) throw new Error('工作流节点不存在');
  if (snapshot.stages.some((item) => item.status === 'running')) throw new Error('存在正在执行的节点，请等待完成后再重新执行');

  const history = await readJson<WorkflowHistoryRecord[]>(storagePaths.workflowHistory, []);
  const archived: WorkflowHistoryRecord = {
    ...snapshot,
    historyId: `wfh-${randomUUID()}`,
    rerunFrom: stageKey,
    rerunReason: reason.trim(),
    archivedAt: nowText(),
  };
  await writeJsonAtomic(dataPath(storagePaths.workflowHistory), [archived, ...history]);

  const resetStages = snapshot.stages.map((stage, index) => index < stageIndex ? stage : {
    ...stage,
    status: 'pending' as const,
    output: '',
    runId: '',
    error: '',
    updatedAt: '',
    confirmedAt: '',
  });
  return saveSnapshot({
    ...snapshot,
    version: (snapshot.version ?? 1) + 1,
    activeStage: stageKey,
    stages: resetStages,
    updatedAt: nowText(),
  });
}

function findStage(snapshot: WorkflowSnapshot, stageKey: WorkflowStageKey) {
  const stage = snapshot.stages.find((item) => item.key === stageKey);
  if (!stage) throw new Error('工作流节点不存在');
  return stage;
}

export async function runWorkflowStage(projectId: string, stageKey: WorkflowStageKey, customInput?: string) {
  const lockKey = `${projectId}:${stageKey}`;
  if (runningStages.has(lockKey)) throw new Error('当前节点正在执行，请勿重复提交');
  runningStages.add(lockKey);
  try {
    const capability = (await getWorkflowCapabilities(projectId)).stages.find((item) => item.stageKey === stageKey);
    if (capability && !capability.available) throw new Error(capability.reasons.join('；'));
    let snapshot = await getWorkflow(projectId);
    const stage = findStage(snapshot, stageKey);
    if (stage.status === 'running') throw new Error('当前节点正在执行，请等待执行完成');
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
  } finally {
    runningStages.delete(lockKey);
  }
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
