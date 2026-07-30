import { randomUUID } from 'node:crypto';
import { nowText, storagePaths } from './config.js';
import { startAgentRun } from './agent-runtime.js';
import { dataPath, readJson, writeJsonAtomic } from './storage.js';
import type { ProjectRecord, WorkflowHistoryRecord, WorkflowSnapshot, WorkflowStageKey, WorkflowStageRecord } from './types.js';
import type { AgentRecord, ModelRecord, WorkflowCapabilityReport } from './types.js';
import { existsSync } from 'node:fs';
import { getOllamaStatus } from './ollama-client.js';
import { getProjectAgentPlan, projectRequirements, resolveRequirementAgent } from './agent-planner.js';
import { applyFileChangeSet, generateFileChangeSet, listFileChangeSets } from './file-change-runtime.js';

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
const workflowContextBudget = 24000;
const perStageContextBudget = 6000;

function truncateWorkflowOutput(output: string) {
  if (output.length <= perStageContextBudget) return output;
  const headLength = Math.floor(perStageContextBudget * 0.7);
  const tailLength = perStageContextBudget - headLength;
  return `${output.slice(0, headLength)}\n\n[中间内容已按上下文预算省略]\n\n${output.slice(-tailLength)}`;
}

function buildWorkflowContext(stages: WorkflowStageRecord[], currentStageKey: WorkflowStageKey) {
  const sections = stages
    .filter((item) => item.output && item.key !== currentStageKey)
    .map((item) => `【${item.title}产物摘要】\n${truncateWorkflowOutput(item.output)}`);
  const selected: string[] = [];
  let used = 0;
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    const section = sections[index];
    if (used + section.length > workflowContextBudget) continue;
    selected.unshift(section);
    used += section.length;
  }
  return selected.join('\n\n');
}

function buildTechnologyContext(plan: Awaited<ReturnType<typeof getProjectAgentPlan>>) {
  if (plan.technologyRecommendations.length === 0) return '';
  const selections = plan.technologyRecommendations.map((item) => {
    const choice = item.selected?.trim() || item.recommended;
    return `- ${item.area}：${choice}${item.confirmed ? '（用户已确认）' : '（模型推荐，用户尚未确认）'}`;
  });
  return `【项目技术选型】\n${selections.join('\n')}\n后续设计、开发、测试和文档必须以这些选型为准；如发现冲突，应明确指出并等待用户调整，不得自行替换。`;
}

function createStages(project: ProjectRecord, agents: AgentRecord[], capabilities: { hasFrontend: boolean; hasBackend: boolean }, planning = ''): WorkflowStageRecord[] {
  const requirements = projectRequirements(project, capabilities, planning).filter((item) => item.workflowStageKey);
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
  const [plan, snapshots, projects, agents, savedPlans] = await Promise.all([
    getProjectAgentPlan(projectId),
    readSnapshots(),
    readJson<ProjectRecord[]>(storagePaths.projects, []),
    readJson<AgentRecord[]>(storagePaths.agents, []),
    readJson<Array<{ projectId: string; planning: string }>>(storagePaths.projectAgentPlans, []),
  ]);
  const existing = snapshots.find((item) => item.projectId === projectId);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const planning = savedPlans.find((item) => item.projectId === projectId)?.planning ?? '';
  const desiredStages = createStages(project, agents, plan, planning);
  if (existing) {
    const stages = desiredStages.map((desired) => {
      const previous = existing.stages.find((item) => item.key === desired.key);
      return previous ? { ...previous, title: desired.title, agentId: desired.agentId, requiresApproval: desired.requiresApproval } : desired;
    });
    const activeStage = stages.some((item) => item.key === existing.activeStage)
      ? existing.activeStage
      : stages.find((item) => item.status !== 'approved')?.key ?? stages[0]?.key ?? 'requirements';
    const synchronized = { ...existing, version: existing.version ?? 1, autoApproveSeconds: 0, activeStage, stages };
    if (JSON.stringify(synchronized) === JSON.stringify(existing)) return existing;
    return saveSnapshot(synchronized);
  }
  const now = nowText();
  return saveSnapshot({
    id: `wf-${randomUUID()}`,
    version: 1,
    projectId,
    projectName: project.name,
    activeStage: 'requirements',
    autoMode: true,
    autoApproveSeconds: 0,
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
    const context = buildWorkflowContext(snapshot.stages, stageKey);
    const technologyContext = buildTechnologyContext(await getProjectAgentPlan(projectId));
    const input = [customInput?.trim() || stage.input, technologyContext, context].filter(Boolean).join('\n\n');
    snapshot = await saveSnapshot({
      ...snapshot,
      activeStage: stageKey,
      updatedAt: nowText(),
      stages: snapshot.stages.map((item) => item.key === stageKey ? { ...item, status: 'running', input, error: '', updatedAt: nowText() } : item),
    });
    let run: { status: string; output: string; id: string; error: string };
    try {
      if (stageKey === 'frontend' || stageKey === 'backend') {
        const target = stageKey === 'frontend' ? '前端' : '后端';
        const changeSet = await generateFileChangeSet(
          projectId,
          stage.agentId,
          [
            input,
            `现在执行${target}开发，不再输出规划或伪代码。请生成可直接运行、构建和测试的完整代码文件变更集。`,
            '必须包含项目初始化、依赖配置、核心业务代码和必要测试；按照已确认的技术选型组织目录与文件。',
          ].join('\n\n'),
        );
        const applied = snapshot.autoMode ? await applyFileChangeSet(changeSet.id) : changeSet;
        run = {
          status: 'success',
          id: changeSet.agentRunId,
          error: '',
          output: [
            `${target}代码变更集已生成，共 ${changeSet.files.length} 个文件。`,
            `变更状态：${applied.status === 'applied' ? '已自动写入项目' : '等待用户在文件变更中审批'}`,
            '',
            ...changeSet.files.map((file) => `- ${file.action}: ${file.path}`),
          ].join('\n'),
        };
      } else {
        run = await startAgentRun({ projectId, agentId: stage.agentId, input });
      }
    } catch (error) {
      run = {
        status: 'failed',
        output: '',
        id: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
  if (stageKey === 'frontend' || stageKey === 'backend') {
    const pendingChangeSet = (await listFileChangeSets(projectId))
      .find((item) => item.agentRunId === stage.runId && item.status === 'pending');
    if (pendingChangeSet) throw new Error(`请先在“文件变更”中应用${stageKey === 'frontend' ? '前端' : '后端'}代码，再确认当前节点`);
  }
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
    const model = project
      ? models.find((item) => item.name === project.modelName && item.enabled)
      : undefined;
    if (agent && !model) reasons.push(`项目绑定模型“${project?.modelName || '未配置'}”不存在或未启用`);
    if (model?.provider === 'Ollama' && (!ollamaRunning || !installedModels.has(model.modelId))) reasons.push(`本地模型 ${model.modelId} 未运行或未安装`);
    if (!projectPathAvailable && ['frontend', 'backend', 'review', 'debug', 'test', 'docs'].includes(stage.key)) reasons.push('项目路径不存在');
    return { stageKey: stage.key, agentId: stage.agentId, available: reasons.length === 0, reasons };
  });
  return { projectId, projectPathAvailable, stages, ready: stages.every((item) => item.available) };
}
