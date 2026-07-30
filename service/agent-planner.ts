import { createHash } from 'node:crypto';
import { nowText, storagePaths } from './config.js';
import { createDefaultAgents } from './default-agents.js';
import { generateWithModel, normalizeModelError } from './model-client.js';
import { createProjectCancellation } from './project-cancellation.js';
import { resolveModelExecutionProfile } from './model-capabilities.js';
import { dataPath, readJson, writeJsonAtomic } from './storage.js';
import type { AgentPlan, AgentPlanItem, AgentRecord, ModelRecord, ProjectRecord, WorkflowStageKey } from './types.js';

type Requirement = {
  key: string;
  agentId: string;
  category: string;
  task: string;
  workflowStageKey?: WorkflowStageKey;
};

const commonRequirements: Requirement[] = [
  { key: 'requirements', agentId: 'a-requirement', category: '需求分析', workflowStageKey: 'requirements', task: '整理原始需求，输出 PRD、页面或接口清单、角色权限、业务流程、验收标准和待确认项。' },
  { key: 'architecture', agentId: 'a-architecture', category: '架构设计', workflowStageKey: 'architecture', task: '根据 PRD 输出技术选型、系统架构、模块边界、数据模型、接口契约和风险清单。' },
  { key: 'planning', agentId: 'a-file-split', category: '文件拆分', workflowStageKey: 'planning', task: '将架构拆成可执行开发计划，明确目录、文件、组件职责、依赖关系和验收节点。' },
  { key: 'review', agentId: 'a-review', category: '代码审核', workflowStageKey: 'review', task: '审核实现代码的规范、引用、类型、安全、性能和测试覆盖，输出分级问题清单。' },
  { key: 'debug', agentId: 'a-debug', category: '调试修复', workflowStageKey: 'debug', task: '结合运行、构建、测试与审核结果定位问题，生成最小修复方案和回归步骤。' },
  { key: 'test', agentId: 'a-test-build', category: '测试构建', workflowStageKey: 'test', task: '执行并汇总 Lint、测试、构建和本地验收，输出可追溯测试报告。' },
  { key: 'docs', agentId: 'a-docs', category: '文档', workflowStageKey: 'docs', task: '整理项目说明、接口文档、运行构建方式、配置说明和交付报告。' },
];

type CapabilityAnalysis = {
  hasFrontend: boolean;
  hasBackend: boolean;
  needsDatabase: boolean;
  needsServer: boolean;
  reasoning: string;
  pendingQuestions: string[];
  technologyRecommendations: TechnologyRecommendation[];
};

type TechnologyRecommendation = {
  area: string;
  recommended: string;
  alternatives: string[];
  selected?: string;
  confirmed?: boolean;
  reason: string;
};

const capabilitySchemaVersion = 2;

function normalizeTechnologyRecommendations(items: TechnologyRecommendation[]) {
  return items.map((item) => ({
    ...item,
    alternatives: Array.from(new Set((item.alternatives ?? []).filter(Boolean))),
    selected: item.selected?.trim() || item.recommended,
    confirmed: Boolean(item.confirmed),
  }));
}

function mergeConfirmedTechnologyRecommendations(next: TechnologyRecommendation[], previous?: TechnologyRecommendation[]) {
  const confirmed = new Map(
    (previous ?? [])
      .filter((item) => item.confirmed && item.area && item.selected)
      .map((item) => [item.area, item]),
  );
  return next.map((item) => {
    const saved = confirmed.get(item.area);
    return saved ? { ...item, selected: saved.selected, confirmed: true } : item;
  });
}

function parseCapabilityAnalysis(text: string): CapabilityAnalysis {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型未返回 JSON 对象');
  const value = JSON.parse(cleaned.slice(start, end + 1)) as Partial<CapabilityAnalysis>;
  for (const key of ['hasFrontend', 'hasBackend', 'needsDatabase', 'needsServer'] as const) {
    if (typeof value[key] !== 'boolean') throw new Error(`模型分析结果缺少布尔字段 ${key}`);
  }
  if (typeof value.reasoning !== 'string' || !value.reasoning.trim()) throw new Error('模型分析结果缺少 reasoning');
  if (!Array.isArray(value.pendingQuestions) || value.pendingQuestions.some((item) => typeof item !== 'string')) {
    throw new Error('模型分析结果 pendingQuestions 格式错误');
  }
  if (!Array.isArray(value.technologyRecommendations) || value.technologyRecommendations.some((item) => {
    if (!item || typeof item !== 'object') return true;
    const recommendation = item as Partial<TechnologyRecommendation>;
    return typeof recommendation.area !== 'string' || typeof recommendation.recommended !== 'string'
      || typeof recommendation.reason !== 'string' || !Array.isArray(recommendation.alternatives)
      || recommendation.alternatives.some((alternative) => typeof alternative !== 'string');
  })) {
    throw new Error('模型分析结果 technologyRecommendations 格式错误');
  }
  if ((value.hasFrontend || value.hasBackend) && value.technologyRecommendations.length === 0) {
    throw new Error('模型分析结果缺少技术选型建议');
  }
  return {
    ...value,
    technologyRecommendations: normalizeTechnologyRecommendations(value.technologyRecommendations as TechnologyRecommendation[]),
  } as CapabilityAnalysis;
}

async function analyzeProjectCapabilities(project: ProjectRecord, planning: string, model: ModelRecord, signal?: AbortSignal) {
  const executionProfile = resolveModelExecutionProfile(model);
  const prompt = [
    `项目名称：${project.name}`,
    `项目介绍：${project.description || '-'}`,
    `原始需求：${project.requirement || '-'}`,
    `约束：${project.constraints || '-'}`,
    `用户当前开发规划：${planning || '-'}`,
    `调度执行模式：${executionProfile.mode}；单次最多分析 ${executionProfile.maxModulesPerAnalysis} 个主要模块。`,
    '',
    '请从完整业务语义判断本项目实际需要的技术能力，不要使用关键词匹配。',
    '区分调用第三方 API 与需要自行开发服务端；不要因为项目尚未配置数据库或服务器就判定不需要后端。',
    '判断 needsDatabase 时分析业务状态是否需要跨请求、跨登录或进程重启后继续存在。用户账户、注册信息、权限、业务记录等需要持久保存的数据，在需求未明确指定模拟数据或内存存储时，应判定需要数据库。',
    '数据库设计与读写由架构设计 Agent 和后端开发 Agent 负责，不需要为了数据库单独虚构一个 Agent 类型。',
    'needsServer 表示开发、测试或部署必须由用户补充服务器配置；本地可完成时应为 false。',
    '同时根据需求规模、运行平台、团队维护成本、生态成熟度和本地开发条件给出技术选型建议。只输出本项目适用的层级，例如前端框架、UI 组件库、状态管理、后端运行时与框架、数据库、测试和构建工具。每项必须包含一个推荐方案、最多三个备选方案及具体选择理由。',
    '严格返回 JSON：',
    '{"hasFrontend":true,"hasBackend":true,"needsDatabase":false,"needsServer":false,"reasoning":"具体判断依据","pendingQuestions":[],"technologyRecommendations":[{"area":"前端框架","recommended":"Vue 3 + TypeScript + Vite","alternatives":["React + TypeScript + Vite"],"reason":"结合当前项目需求说明选择依据"}]}',
  ].join('\n');
  try {
    const result = await generateWithModel({
      model,
      system: '你是平台内置的主调度器，负责分析需求边界、识别项目能力并决定需要哪些专项 Agent。只输出符合指定 Schema 的 JSON。',
      prompt,
      json: model.capabilities.structuredOutput,
      maxOutputTokens: executionProfile.outputBudget,
      timeoutSeconds: executionProfile.timeoutSeconds,
      signal,
    });
    try {
      return parseCapabilityAnalysis(result.text);
    } catch (parseError) {
      if (!executionProfile.requireSchemaRepair) throw parseError;
      const repaired = await generateWithModel({
        model,
        system: '你是 JSON 修复器。只修复格式并保留原始语义，不得增加需求中不存在的事实。只输出 JSON。',
        prompt: `请将下面内容修复为主调度 Schema JSON。必需字段：hasFrontend、hasBackend、needsDatabase、needsServer、reasoning、pendingQuestions、technologyRecommendations。\n\n${result.text}`,
        json: model.capabilities.structuredOutput,
        maxOutputTokens: executionProfile.outputBudget,
        timeoutSeconds: executionProfile.timeoutSeconds,
        signal,
      });
      return parseCapabilityAnalysis(repaired.text);
    }
  } catch (error) {
    throw new Error(`主调度项目分析失败：${normalizeModelError(error, model)}`);
  }
}

function planningExcludes(planning: string, subject: string) {
  return new RegExp(`(不需要|无需|移除|跳过)(?:${subject})`).test(planning);
}

export function projectRequirements(project: ProjectRecord, capabilities: Pick<CapabilityAnalysis, 'hasFrontend' | 'hasBackend'>, planning = ''): Requirement[] {
  const { hasFrontend, hasBackend } = capabilities;
  const development: Requirement[] = [];
  if (hasFrontend) development.push({ key: 'frontend', agentId: 'a-frontend', category: '前端开发', workflowStageKey: 'frontend', task: '实现前端页面、组件、状态管理、交互、接口接入、响应式布局和前端测试。' });
  if (hasBackend) development.push({ key: 'backend', agentId: 'a-backend', category: '后端开发', workflowStageKey: 'backend', task: '实现服务端接口、数据库读写、鉴权、校验、日志、异常处理和后端测试。' });
  const requirements = [...commonRequirements.slice(0, 3), ...development, ...commonRequirements.slice(3)];
  return requirements.filter((item) => {
    if (item.key === 'review' && planningExcludes(planning, '代码审核')) return false;
    if (item.key === 'debug' && planningExcludes(planning, '调试修复')) return false;
    if (item.key === 'test' && planningExcludes(planning, '测试|构建')) return false;
    if (item.key === 'docs' && planningExcludes(planning, '文档')) return false;
    return true;
  });
}

export function resolveRequirementAgent(requirement: Requirement, agents: AgentRecord[]) {
  return agents.find((item) => item.id === requirement.agentId && item.enabled)
    ?? agents.find((item) => item.category === requirement.category && item.enabled)
    ?? null;
}

type StoredProjectPlan = { projectId: string; planning: string; fingerprint?: string; analysis?: CapabilityAnalysis; updatedAt: string };

export async function updateProjectTechnologyRecommendations(projectId: string, recommendations: TechnologyRecommendation[]): Promise<AgentPlan> {
  const savedPlans = await readJson<StoredProjectPlan[]>(storagePaths.projectAgentPlans, []);
  const savedPlan = savedPlans.find((item) => item.projectId === projectId);
  if (!savedPlan?.analysis) throw new Error('请先生成 Agent 清单后再确认技术选型');
  const normalized = normalizeTechnologyRecommendations(recommendations).map((item) => ({
    ...item,
    confirmed: true,
  }));
  const nextPlan: StoredProjectPlan = {
    ...savedPlan,
    analysis: {
      ...savedPlan.analysis,
      technologyRecommendations: normalized,
    },
    updatedAt: nowText(),
  };
  await writeJsonAtomic(dataPath(storagePaths.projectAgentPlans), [nextPlan, ...savedPlans.filter((item) => item.projectId !== projectId)]);
  return getProjectAgentPlan(projectId);
}

export async function getProjectAgentPlan(projectId: string, nextPlanning?: string): Promise<AgentPlan> {
  const [projects, agents, models, savedPlans] = await Promise.all([
    readJson<ProjectRecord[]>(storagePaths.projects, []),
    readJson<AgentRecord[]>(storagePaths.agents, []),
    readJson<ModelRecord[]>(storagePaths.models, []),
    readJson<StoredProjectPlan[]>(storagePaths.projectAgentPlans, []),
  ]);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const model = models.find((item) => item.name === project.modelName && item.enabled);
  if (!model) throw new Error(`项目绑定模型“${project.modelName || '未配置'}”不存在或未启用`);
  const modelName = model.name;
  const defaultPlanning = [project.requirement, project.description, project.constraints ? `硬性约束：${project.constraints}` : ''].filter(Boolean).join('\n\n') || `完成${project.name}的需求分析、架构设计、开发、审核、测试和交付文档。`;
  const planning = nextPlanning?.trim() || project.requirement.trim() || defaultPlanning;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([capabilitySchemaVersion, project.description, project.requirement, project.constraints, planning, model.id, model.modelId, model.contextWindow, model.maxOutput, model.timeout, model.capabilities, model.execution]))
    .digest('hex');
  const savedPlan = savedPlans.find((item) => item.projectId === projectId);
  let analysis: CapabilityAnalysis;
  if (nextPlanning === undefined && savedPlan?.fingerprint === fingerprint && savedPlan.analysis) {
    analysis = savedPlan.analysis;
  } else {
    const cancellation = createProjectCancellation(projectId);
    try {
      analysis = await analyzeProjectCapabilities(project, planning, model, cancellation.signal);
    } finally {
      cancellation.release();
    }
  }
  analysis.technologyRecommendations = mergeConfirmedTechnologyRecommendations(
    normalizeTechnologyRecommendations(analysis.technologyRecommendations),
    savedPlan?.analysis?.technologyRecommendations,
  );
  if (nextPlanning !== undefined || savedPlan?.fingerprint !== fingerprint || !savedPlan.analysis) {
    const record: StoredProjectPlan = { projectId, planning, fingerprint, analysis, updatedAt: nowText() };
    await writeJsonAtomic(dataPath(storagePaths.projectAgentPlans), [record, ...savedPlans.filter((item) => item.projectId !== projectId)]);
  }
  if (nextPlanning !== undefined && project.requirement !== planning) {
    await writeJsonAtomic(
      dataPath(storagePaths.projects),
      projects.map((item) => item.id === projectId ? {
        ...item,
        requirement: planning,
        configVersion: item.configVersion + 1,
        updatedAt: nowText(),
      } : item),
    );
  }
  const proposals = new Map(createDefaultAgents(modelName).map((item) => [item.id, item]));
  const requirements = projectRequirements(project, analysis, planning);
  const items: AgentPlanItem[] = requirements.map((requirement) => {
    const agent = resolveRequirementAgent(requirement, agents);
    const fallback = proposals.get(requirement.agentId) ?? {
      id: requirement.agentId,
      name: `${requirement.category} Agent`,
      category: requirement.category,
      modelName,
      risk: '中' as const,
      enabled: true,
      description: requirement.task,
      prompt: `你是${requirement.category} Agent。请严格围绕分配任务输出可执行结果。`,
      permissions: ['读取项目配置', '生成任务产物'],
      approvalRules: ['写文件或敏感变更需要用户确认'],
      contextRules: ['仅使用当前项目配置、需求和已确认产物', '信息不足时列出待确认项'],
      outputFormat: '输出任务结论、实施清单、风险、验收标准和下一步。',
      qualityGates: ['结果可执行且可验证', '不得编造项目现状', '敏感操作已标记人工确认'],
    };
    return {
      key: requirement.key,
      workflowStageKey: requirement.workflowStageKey,
      expectedAgentId: requirement.agentId,
      name: fallback.name,
      category: requirement.category,
      task: requirement.task,
      required: true,
      available: Boolean(agent),
      agent,
      proposedAgent: { ...fallback, id: '' },
    };
  });
  const { hasFrontend, hasBackend, needsDatabase, needsServer, reasoning, pendingQuestions } = analysis;
  const technologyRecommendations = normalizeTechnologyRecommendations(analysis.technologyRecommendations);
  const projectScope = hasFrontend && hasBackend ? '前后端项目' : hasBackend ? '后端项目' : '前端项目';
  const capabilitySummary = `${needsDatabase ? '需要数据库' : '暂不需要数据库'}，${needsServer ? '需要服务器配置' : '暂不需要服务器配置'}`;
  return {
    projectId,
    planning,
    hasFrontend,
    hasBackend,
    needsDatabase,
    needsServer,
    reasoning,
    pendingQuestions,
    technologyRecommendations,
    summary: `规划结果：${projectScope}，${capabilitySummary}；本次需要 ${items.length} 类专项 Agent，已就绪 ${items.filter((item) => item.available).length} 类，缺失 ${items.filter((item) => !item.available).length} 类。`,
    items,
    updatedAt: nowText(),
  };
}
