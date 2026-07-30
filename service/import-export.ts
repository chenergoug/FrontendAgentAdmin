import { randomUUID } from 'node:crypto';
import { nowText } from './config.js';
import type { AgentRecord, ModelRecord, ProjectRecord, ProjectStatus } from './types.js';

type ImportBody<T> = T[] | { items?: T[] };

const projectShapes = new Set(['纯前端', '纯后端', '全栈 Monorepo', '前后端分离']);
const projectDeviceTypes = new Set(['PC端', '小程序', 'Android', 'iOS', '移动端', '桌面端']);
const projectStatuses = new Set<ProjectStatus>(['draft', 'ready', 'running', 'locked', 'error']);
const modelTypes = new Set(['线上模型', '本地离线模型']);
const riskLevels = new Set(['低', '中', '高']);

function asItems<T>(body: ImportBody<T>) {
  return Array.isArray(body) ? body : body.items;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown, max = 1000) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isOptionalString(value: unknown, max = 1000) {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= max);
}

function isPositiveNumber(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;
}

function validUrl(value: unknown, required: boolean) {
  if (!required && (value === undefined || value === null || value === '')) return true;
  if (typeof value !== 'string') return false;
  return /^(https?:\/\/|git@)/.test(value);
}

function validLocalOrRemoteUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false;
  return /^(https?:\/\/)/.test(value);
}

function validStringArray(value: unknown, maxItems = 50) {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => isString(item, 500));
}

function assertUniqueIds<T extends { id?: string }>(items: T[], errors: string[]) {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    if (!item.id) return;
    if (ids.has(item.id)) {
      errors.push(`第 ${index + 1} 条 id 重复：${item.id}`);
    }
    ids.add(item.id);
  });
}

function normalizeImportBody<T>(body: ImportBody<T>, resourceName: string) {
  const items = asItems(body);
  if (!Array.isArray(items)) {
    return { items: [] as T[], errors: [`${resourceName} 导入文件必须是数组，或包含 items 数组`] };
  }
  if (items.length === 0) {
    return { items, errors: [`${resourceName} 导入数据不能为空`] };
  }
  if (items.length > 500) {
    return { items, errors: [`${resourceName} 单次最多导入 500 条`] };
  }
  return { items, errors: [] as string[] };
}

export function normalizeProjectsImport(body: ImportBody<Partial<ProjectRecord>>) {
  const { items, errors } = normalizeImportBody(body, '项目');
  assertUniqueIds(items, errors);

  const normalized = items.map((item, index): ProjectRecord | null => {
    if (!isObject(item)) {
      errors.push(`第 ${index + 1} 条不是对象`);
      return null;
    }
    if (!isString(item.name, 100)) errors.push(`第 ${index + 1} 条项目名称不能为空且不能超过 100 字`);
    if (!projectShapes.has(String(item.shape))) errors.push(`第 ${index + 1} 条项目形态不合法`);
    if (!projectDeviceTypes.has(String(item.deviceType))) errors.push(`第 ${index + 1} 条项目类型不合法`);
    if (!isString(item.rootPath, 1000)) errors.push(`第 ${index + 1} 条项目路径不能为空`);
    if (!isOptionalString(item.serverFramework, 100)) errors.push(`第 ${index + 1} 条服务端技术栈过长`);
    if (!isOptionalString(item.serverRootPath, 1000)) errors.push(`第 ${index + 1} 条服务端目录过长`);
    if (!isOptionalString(item.serverDevCommand, 500)) errors.push(`第 ${index + 1} 条服务端运行命令过长`);
    if (!isOptionalString(item.serverBuildCommand, 500)) errors.push(`第 ${index + 1} 条服务端构建命令过长`);
    if (!isOptionalString(item.serverTestCommand, 500)) errors.push(`第 ${index + 1} 条服务端测试命令过长`);
    if (!isOptionalString(item.databaseType, 100)) errors.push(`第 ${index + 1} 条数据库类型过长`);
    if (!isOptionalString(item.databaseHost, 500)) errors.push(`第 ${index + 1} 条数据库主机过长`);
    if (!isOptionalString(item.databasePort, 10)) errors.push(`第 ${index + 1} 条数据库端口不合法`);
    if (!isOptionalString(item.databaseName, 200)) errors.push(`第 ${index + 1} 条数据库名称过长`);
    if (!isOptionalString(item.databaseUsername, 200)) errors.push(`第 ${index + 1} 条数据库账号过长`);
    if (!validUrl(item.gitRemote, false)) errors.push(`第 ${index + 1} 条 Git 地址格式不合法`);
    if (!validUrl(item.serverUrl, false)) errors.push(`第 ${index + 1} 条服务器地址格式不合法`);
    if (item.status && !projectStatuses.has(item.status)) errors.push(`第 ${index + 1} 条项目状态不合法`);
    if (!isOptionalString(item.businessType, 200)) errors.push(`第 ${index + 1} 条业务类型过长`);
    if (!isOptionalString(item.description, 2000)) errors.push(`第 ${index + 1} 条项目介绍过长`);
    if (!isOptionalString(item.requirement, 10000)) errors.push(`第 ${index + 1} 条原始需求过长`);

    return {
      id: isOptionalString(item.id, 100) && item.id ? item.id : `p-${randomUUID()}`,
      name: String(item.name ?? '').trim(),
      source: item.source === '导入' || item.source === '新建' ? item.source : '导入',
      shape: String(item.shape ?? ''),
      deviceType: String(item.deviceType ?? ''),
      businessType: String(item.businessType ?? ''),
      rootPath: String(item.rootPath ?? ''),
      serverFramework: String(item.serverFramework ?? ''),
      serverRootPath: String(item.serverRootPath ?? ''),
      serverDevCommand: String(item.serverDevCommand ?? ''),
      serverBuildCommand: String(item.serverBuildCommand ?? ''),
      serverTestCommand: String(item.serverTestCommand ?? ''),
      databaseType: String(item.databaseType ?? ''),
      databaseHost: String(item.databaseHost ?? ''),
      databasePort: String(item.databasePort ?? ''),
      databaseName: String(item.databaseName ?? ''),
      databaseUsername: String(item.databaseUsername ?? ''),
      databasePasswordConfigured: false,
      gitRemote: String(item.gitRemote ?? ''),
      branch: String(item.branch ?? 'develop'),
      serverUrl: String(item.serverUrl ?? ''),
      devCommand: String(item.devCommand ?? 'pnpm dev'),
      buildCommand: String(item.buildCommand ?? 'pnpm build'),
      lintCommand: String(item.lintCommand ?? 'pnpm lint'),
      testCommand: String(item.testCommand ?? 'pnpm test'),
      configVersion: typeof item.configVersion === 'number' ? item.configVersion : 1,
      status: item.status && item.status !== 'running' ? item.status : 'ready',
      updatedAt: nowText(),
      description: String(item.description ?? ''),
      requirement: String(item.requirement ?? ''),
    };
  });

  return { items: normalized.filter(Boolean) as ProjectRecord[], errors };
}

export function normalizeModelsImport(body: ImportBody<Partial<ModelRecord>>) {
  const { items, errors } = normalizeImportBody(body, '模型');
  assertUniqueIds(items, errors);

  const normalized = items.map((item, index): ModelRecord | null => {
    if (!isObject(item)) {
      errors.push(`第 ${index + 1} 条不是对象`);
      return null;
    }
    if (!isString(item.name, 100)) errors.push(`第 ${index + 1} 条模型名称不能为空且不能超过 100 字`);
    if (!modelTypes.has(String(item.type))) errors.push(`第 ${index + 1} 条模型类型不合法`);
    if (!isString(item.provider, 100)) errors.push(`第 ${index + 1} 条服务商不能为空`);
    if (!validLocalOrRemoteUrl(item.baseUrl)) errors.push(`第 ${index + 1} 条服务地址必须是 http/https 地址`);
    if (!isString(item.modelId, 200) || /\s/.test(String(item.modelId))) errors.push(`第 ${index + 1} 条 Model ID 不合法`);
    if (!isPositiveNumber(item.contextWindow, 1000000)) errors.push(`第 ${index + 1} 条上下文长度必须是正数`);
    if (!isPositiveNumber(item.maxOutput, 1000000)) errors.push(`第 ${index + 1} 条最大输出必须是正数`);
    if (!isPositiveNumber(item.timeout, 3600)) errors.push(`第 ${index + 1} 条超时时间必须是 1-3600 秒`);

    return {
      id: isOptionalString(item.id, 100) && item.id ? item.id : `m-${randomUUID()}`,
      name: String(item.name ?? '').trim(),
      type: item.type === '本地离线模型' ? '本地离线模型' : '线上模型',
      provider: String(item.provider ?? ''),
      baseUrl: String(item.baseUrl ?? ''),
      modelId: String(item.modelId ?? ''),
      contextWindow: Number(item.contextWindow ?? 32768),
      maxOutput: Number(item.maxOutput ?? 4096),
      timeout: Number(item.timeout ?? 120),
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      healthy: false,
      checkedAt: '未检查',
    };
  });

  return { items: normalized.filter(Boolean) as ModelRecord[], errors };
}

export function normalizeAgentsImport(body: ImportBody<Partial<AgentRecord>>) {
  const { items, errors } = normalizeImportBody(body, 'Agent');
  assertUniqueIds(items, errors);

  const normalized = items.map((item, index): AgentRecord | null => {
    if (!isObject(item)) {
      errors.push(`第 ${index + 1} 条不是对象`);
      return null;
    }
    if (!isString(item.name, 100)) errors.push(`第 ${index + 1} 条 Agent 名称不能为空且不能超过 100 字`);
    if (!isString(item.category, 100)) errors.push(`第 ${index + 1} 条 Agent 类型不能为空`);
    if (item.category === '主调度' || /总调度/.test(String(item.name ?? ''))) errors.push(`第 ${index + 1} 条主调度是平台内置机制，不能导入为 Agent`);
    if (!isString(item.modelName, 100)) errors.push(`第 ${index + 1} 条默认模型不能为空`);
    if (!riskLevels.has(String(item.risk))) errors.push(`第 ${index + 1} 条风险等级不合法`);
    if (!isOptionalString(item.description, 2000)) errors.push(`第 ${index + 1} 条职责描述过长`);
    if (!isString(item.prompt, 20000)) errors.push(`第 ${index + 1} 条 Prompt 不能为空且不能超过 20000 字`);
    if (!validStringArray(item.permissions)) errors.push(`第 ${index + 1} 条权限必须是字符串数组`);
    if (!validStringArray(item.approvalRules)) errors.push(`第 ${index + 1} 条审批规则必须是字符串数组`);
    if (!validStringArray(item.contextRules)) errors.push(`第 ${index + 1} 条上下文规则必须是字符串数组`);
    if (!isString(item.outputFormat, 10000)) errors.push(`第 ${index + 1} 条输出规范不能为空且不能超过 10000 字`);
    if (!validStringArray(item.qualityGates)) errors.push(`第 ${index + 1} 条质量门禁必须是字符串数组`);

    return {
      id: isOptionalString(item.id, 100) && item.id ? item.id : `a-${randomUUID()}`,
      name: String(item.name ?? '').trim(),
      category: String(item.category ?? ''),
      modelName: String(item.modelName ?? ''),
      risk: item.risk === '高' || item.risk === '低' ? item.risk : '中',
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      description: String(item.description ?? ''),
      prompt: String(item.prompt ?? ''),
      permissions: Array.isArray(item.permissions) ? item.permissions.map(String) : [],
      approvalRules: Array.isArray(item.approvalRules) ? item.approvalRules.map(String) : [],
      contextRules: Array.isArray(item.contextRules) ? item.contextRules.map(String) : [],
      outputFormat: String(item.outputFormat ?? ''),
      qualityGates: Array.isArray(item.qualityGates) ? item.qualityGates.map(String) : [],
    };
  });

  return { items: normalized.filter(Boolean) as AgentRecord[], errors };
}

export function mergeById<T extends { id: string }>(current: T[], imported: T[]) {
  const importedIds = new Set(imported.map((item) => item.id));
  return [...imported, ...current.filter((item) => !importedIds.has(item.id))];
}

function normalizeUniqueName(name: unknown) {
  return String(name ?? '').trim().toLowerCase();
}

export function findNameConflict<T extends { id: string; name: string }>(items: T[], name: unknown, excludeId?: string) {
  const targetName = normalizeUniqueName(name);
  if (!targetName) return undefined;
  return items.find((item) => item.id !== excludeId && normalizeUniqueName(item.name) === targetName);
}

export function validateImportUniqueNames<T extends { id: string; name: string }>(resourceName: string, current: T[], imported: T[]) {
  const errors: string[] = [];
  const names = new Map<string, T>();

  imported.forEach((item, index) => {
    const key = normalizeUniqueName(item.name);
    const duplicate = names.get(key);
    if (duplicate) {
      errors.push(`${resourceName}导入失败：第 ${index + 1} 条名称“${item.name}”在导入文件中重复`);
      return;
    }
    names.set(key, item);
  });

  imported.forEach((item) => {
    const conflict = findNameConflict(current, item.name, item.id);
    if (conflict) {
      errors.push(`${resourceName}导入失败：名称“${item.name}”已存在`);
    }
  });

  return errors;
}

export function selectExportItems<T extends { id: string }>(items: T[], url: URL) {
  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return { items: [] as T[], errors: ['请选择需要导出的数据'] };
  }

  const idSet = new Set(ids);
  const selected = items.filter((item) => idSet.has(item.id));
  if (selected.length === 0) {
    return { items: selected, errors: ['未找到需要导出的数据'] };
  }

  if (selected.length !== idSet.size) {
    return { items: selected, errors: ['部分导出数据不存在，请刷新列表后重试'] };
  }

  return { items: selected, errors: [] as string[] };
}

export function exportPayload<T>(resource: string, items: T[]) {
  return {
    resource,
    exportedAt: nowText(),
    total: items.length,
    items,
  };
}
