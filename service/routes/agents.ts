import { randomUUID } from 'node:crypto';
import type http from 'node:http';
import { storagePaths } from '../config.js';
import { includes, listResponse, parseBody, send } from '../http-utils.js';
import { exportPayload, findNameConflict, mergeById, normalizeAgentsImport, selectExportItems, validateImportUniqueNames } from '../import-export.js';
import { ensureDefaultAgents } from '../agent-runtime.js';
import { seedAgents } from '../seeds.js';
import { appendLog, dataPath, readJson, writeAgentFiles, writeJsonAtomic } from '../storage.js';
import type { AgentRecord } from '../types.js';
import { getProjectAgentPlan } from '../agent-planner.js';

export async function handleAgentsRoute(request: http.IncomingMessage, response: http.ServerResponse, url: URL, id?: string) {
  const agents = await readJson<AgentRecord[]>(storagePaths.agents, seedAgents);

  if (request.method === 'GET' && id === 'plan') {
    send(response, 200, await getProjectAgentPlan(url.searchParams.get('projectId') ?? ''));
    return true;
  }
  if (request.method === 'POST' && id === 'plan') {
    const body = await parseBody<{ projectId?: string; planning?: string }>(request);
    if (!body.planning?.trim()) {
      send(response, 400, { message: '开发规划不能为空' });
      return true;
    }
    send(response, 200, await getProjectAgentPlan(body.projectId ?? '', body.planning));
    return true;
  }

  if (request.method === 'POST' && id === 'defaults') {
    const body = await parseBody<{ modelName?: string }>(request);
    send(response, 200, await ensureDefaultAgents(body.modelName ?? '本地 Qwen Coder 7B'));
    return true;
  }

  if (request.method === 'GET' && id === 'export') {
    const selected = selectExportItems(agents, url);
    if (selected.errors.length > 0) {
      send(response, 400, { message: 'Agent 导出失败', errors: selected.errors });
      return true;
    }
    send(response, 200, exportPayload('agents', selected.items));
    return true;
  }

  if (request.method === 'POST' && id === 'import') {
    const body = await parseBody<Partial<AgentRecord>[] | { items?: Partial<AgentRecord>[] }>(request);
    const result = normalizeAgentsImport(body);
    if (result.errors.length > 0) {
      send(response, 400, { message: 'Agent 导入失败', errors: result.errors });
      return true;
    }
    const uniqueErrors = validateImportUniqueNames('Agent', agents, result.items);
    if (uniqueErrors.length > 0) {
      send(response, 400, { message: 'Agent 导入失败', errors: uniqueErrors });
      return true;
    }
    const merged = mergeById(agents, result.items);
    await writeJsonAtomic(dataPath(storagePaths.agents), merged);
    await Promise.all(result.items.map(writeAgentFiles));
    await appendLog({
      type: '系统日志',
      level: 'info',
      projectName: '全局',
      title: 'Agent 配置已导入',
      detail: `导入 ${result.items.length} 条 Agent 配置`,
    });
    send(response, 200, { imported: result.items.length, total: merged.length });
    return true;
  }

  if (request.method === 'GET' && !id) {
    const keyword = url.searchParams.get('keyword') ?? '';
    const category = url.searchParams.get('category') ?? '';
    send(
      response,
      200,
      listResponse(agents, url, (item) => (!keyword || includes(item.name, keyword) || includes(item.description, keyword)) && (!category || item.category === category)),
    );
    return true;
  }

  if (request.method === 'GET' && id) {
    send(response, 200, agents.find((item) => item.id === id) ?? null);
    return true;
  }

  if (request.method === 'POST' && !id) {
    const body = await parseBody<Partial<AgentRecord>>(request);
    if (body.category === '主调度' || /总调度/.test(body.name ?? '')) {
      send(response, 400, { message: '主调度是平台内置规划机制，不能创建为 Agent' });
      return true;
    }
    const agentName = body.name ?? '未命名 Agent';
    const conflict = findNameConflict(agents, agentName);
    if (conflict) {
      send(response, 409, { message: `Agent 名称“${String(agentName).trim()}”已存在` });
      return true;
    }
    const agent: AgentRecord = {
      id: `a-${randomUUID()}`,
      name: agentName,
      category: body.category ?? '自定义',
      modelName: body.modelName ?? '',
      risk: body.risk ?? '中',
      enabled: body.enabled ?? true,
      description: body.description ?? '',
      prompt: body.prompt ?? '',
      permissions: body.permissions ?? ['读取文件', '生成 Diff'],
      approvalRules: body.approvalRules ?? ['写文件需要确认'],
      contextRules: body.contextRules ?? ['只读取当前项目和任务相关上下文', '信息不足时明确列出待确认项，不得编造'],
      outputFormat: body.outputFormat ?? '输出结论、执行内容、风险、验证结果和下一步。',
      qualityGates: body.qualityGates ?? ['输出与用户需求一致', '高风险操作已标记人工确认', '不存在无法验证的完成声明'],
    };
    await writeJsonAtomic(dataPath(storagePaths.agents), [agent, ...agents]);
    await writeAgentFiles(agent);
    await appendLog({ type: '系统日志', level: 'info', projectName: '全局', title: 'Agent 配置已新增', detail: agent.name });
    send(response, 201, agent);
    return true;
  }

  if (request.method === 'PUT' && id) {
    const body = await parseBody<Partial<AgentRecord>>(request);
    if (body.category === '主调度' || /总调度/.test(body.name ?? '')) {
      send(response, 400, { message: '主调度是平台内置规划机制，不能配置为 Agent' });
      return true;
    }
    if (body.name !== undefined) {
      const conflict = findNameConflict(agents, body.name, id);
      if (conflict) {
        send(response, 409, { message: `Agent 名称“${String(body.name).trim()}”已存在` });
        return true;
      }
    }
    const updated = agents.map((item) => (item.id === id ? { ...item, ...body, id: item.id } : item));
    const agent = updated.find((item) => item.id === id);
    await writeJsonAtomic(dataPath(storagePaths.agents), updated);
    if (agent) await writeAgentFiles(agent);
    send(response, 200, agent);
    return true;
  }

  if (request.method === 'DELETE' && id) {
    await writeJsonAtomic(dataPath(storagePaths.agents), agents.filter((item) => item.id !== id));
    await appendLog({ type: '系统日志', level: 'warning', projectName: '全局', title: 'Agent 配置已删除', detail: id });
    send(response, 200, { ok: true });
    return true;
  }

  return false;
}
