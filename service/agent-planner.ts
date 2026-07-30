import { nowText, storagePaths } from './config.js';
import { createDefaultAgents } from './default-agents.js';
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

export function projectCapabilities(project: ProjectRecord) {
  return {
    hasFrontend: project.shape !== '纯后端',
    hasBackend: project.shape !== '纯前端' && Boolean(project.serverFramework && project.serverUrl),
  };
}

function planningExcludes(planning: string, subject: string) {
  return new RegExp(`(不需要|无需|移除|跳过)(?:${subject})`).test(planning);
}

export function projectRequirements(project: ProjectRecord, planning = ''): Requirement[] {
  const { hasFrontend, hasBackend } = projectCapabilities(project);
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

type StoredProjectPlan = { projectId: string; planning: string; updatedAt: string };

export async function getProjectAgentPlan(projectId: string, nextPlanning?: string): Promise<AgentPlan> {
  const [projects, agents, models, savedPlans] = await Promise.all([
    readJson<ProjectRecord[]>(storagePaths.projects, []),
    readJson<AgentRecord[]>(storagePaths.agents, []),
    readJson<ModelRecord[]>(storagePaths.models, []),
    readJson<StoredProjectPlan[]>(storagePaths.projectAgentPlans, []),
  ]);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const modelName = models.find((item) => item.name === project.modelName && item.enabled)?.name ?? project.modelName;
  const defaultPlanning = [project.requirement, project.description].filter(Boolean).join('\n\n') || `完成${project.name}的需求分析、架构设计、开发、审核、测试和交付文档。`;
  const planning = nextPlanning?.trim() || savedPlans.find((item) => item.projectId === projectId)?.planning || defaultPlanning;
  if (nextPlanning !== undefined) {
    const record = { projectId, planning, updatedAt: nowText() };
    await writeJsonAtomic(dataPath(storagePaths.projectAgentPlans), [record, ...savedPlans.filter((item) => item.projectId !== projectId)]);
  }
  const proposals = new Map(createDefaultAgents(modelName).map((item) => [item.id, item]));
  const requirements = projectRequirements(project, planning);
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
  const { hasFrontend, hasBackend } = projectCapabilities(project);
  return {
    projectId,
    planning,
    hasFrontend,
    hasBackend,
    summary: `规划结果：${project.shape}项目，本次需要 ${items.length} 类专项 Agent，已就绪 ${items.filter((item) => item.available).length} 类，缺失 ${items.filter((item) => !item.available).length} 类。`,
    items,
    updatedAt: nowText(),
  };
}
