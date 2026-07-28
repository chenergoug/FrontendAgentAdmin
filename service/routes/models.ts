import { randomUUID } from 'node:crypto';
import type http from 'node:http';
import { storagePaths } from '../config.js';
import { includes, listResponse, parseBody, send } from '../http-utils.js';
import { exportPayload, findNameConflict, mergeById, normalizeModelsImport, selectExportItems, validateImportUniqueNames } from '../import-export.js';
import { checkModelHealth } from '../model-health.js';
import { defaultOllamaBaseUrl, getOllamaStatus } from '../ollama-client.js';
import { seedModels } from '../seeds.js';
import { appendLog, dataPath, readJson, writeJsonAtomic } from '../storage.js';
import type { ModelRecord } from '../types.js';

async function validateLocalOllamaModel(provider: string | undefined, modelId: string | undefined) {
  if (provider !== 'Ollama') return '';
  const status = await getOllamaStatus();
  if (!status.running) return 'Ollama 服务未运行';
  if (!modelId || !status.models.some((item) => item.name === modelId)) return `本地未安装模型：${modelId || '-'}`;
  return '';
}

export async function handleModelsRoute(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  url: URL,
  id?: string,
  action?: string,
) {
  const models = await readJson<ModelRecord[]>(storagePaths.models, seedModels);

  if (request.method === 'POST' && id === 'ollama-default') {
    const status = await getOllamaStatus(defaultOllamaBaseUrl);
    const modelId = status.models.some((item) => item.name === 'qwen2.5-coder:7b') ? 'qwen2.5-coder:7b' : status.models[0]?.name ?? 'qwen2.5-coder:7b';
    const modelName = '本地 Qwen Coder 7B';
    const existing = models.find((item) => item.name === modelName || item.modelId === modelId);
    const model: ModelRecord = {
      id: existing?.id ?? `m-${randomUUID()}`,
      name: existing?.name ?? modelName,
      type: '本地离线模型',
      provider: 'Ollama',
      baseUrl: defaultOllamaBaseUrl,
      modelId,
      contextWindow: 32768,
      maxOutput: 4096,
      timeout: 180,
      enabled: true,
      healthy: status.running && status.models.some((item) => item.name === modelId),
      checkedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };
    const nextModels = existing ? models.map((item) => (item.id === existing.id ? model : item)) : [model, ...models];
    await writeJsonAtomic(dataPath(storagePaths.models), nextModels);
    await appendLog({
      type: '系统日志',
      level: model.healthy ? 'info' : 'warning',
      projectName: '全局',
      title: 'Ollama 默认模型已同步',
      detail: `${model.name}: ${model.modelId}`,
    });
    send(response, 200, model);
    return true;
  }

  if (request.method === 'GET' && id === 'export') {
    const selected = selectExportItems(models, url);
    if (selected.errors.length > 0) {
      send(response, 400, { message: '模型导出失败', errors: selected.errors });
      return true;
    }
    send(response, 200, exportPayload('models', selected.items));
    return true;
  }

  if (request.method === 'POST' && id === 'import') {
    const body = await parseBody<Partial<ModelRecord>[] | { items?: Partial<ModelRecord>[] }>(request);
    const result = normalizeModelsImport(body);
    if (result.errors.length > 0) {
      send(response, 400, { message: '模型导入失败', errors: result.errors });
      return true;
    }
    const uniqueErrors = validateImportUniqueNames('模型', models, result.items);
    if (uniqueErrors.length > 0) {
      send(response, 400, { message: '模型导入失败', errors: uniqueErrors });
      return true;
    }
    const merged = mergeById(models, result.items);
    await writeJsonAtomic(dataPath(storagePaths.models), merged);
    await appendLog({
      type: '系统日志',
      level: 'info',
      projectName: '全局',
      title: '模型配置已导入',
      detail: `导入 ${result.items.length} 条模型配置`,
    });
    send(response, 200, { imported: result.items.length, total: merged.length });
    return true;
  }

  if (request.method === 'GET' && !id) {
    const keyword = url.searchParams.get('keyword') ?? '';
    const type = url.searchParams.get('type') ?? '';
    send(response, 200, listResponse(models, url, (item) => (!keyword || includes(item.name, keyword) || includes(item.modelId, keyword)) && (!type || item.type === type)));
    return true;
  }

  if (request.method === 'POST' && !id) {
    const body = await parseBody<Partial<ModelRecord>>(request);
    const localModelError = await validateLocalOllamaModel(body.provider, body.modelId);
    if (localModelError) {
      send(response, 400, { message: localModelError });
      return true;
    }
    const modelName = body.name ?? '未命名模型';
    const conflict = findNameConflict(models, modelName);
    if (conflict) {
      send(response, 409, { message: `模型名称“${String(modelName).trim()}”已存在` });
      return true;
    }
    const model: ModelRecord = {
      id: `m-${randomUUID()}`,
      name: modelName,
      type: body.type ?? '线上模型',
      provider: body.provider ?? 'OpenAI',
      baseUrl: body.baseUrl ?? '',
      modelId: body.modelId ?? '',
      contextWindow: body.contextWindow ?? 32768,
      maxOutput: body.maxOutput ?? 4096,
      timeout: body.timeout ?? 120,
      enabled: body.enabled ?? true,
      healthy: false,
      checkedAt: '未检查',
    };
    await writeJsonAtomic(dataPath(storagePaths.models), [model, ...models]);
    await appendLog({ type: '系统日志', level: 'info', projectName: '全局', title: '模型配置已新增', detail: model.name });
    send(response, 201, model);
    return true;
  }

  if (request.method === 'PUT' && id) {
    const body = await parseBody<Partial<ModelRecord>>(request);
    const existing = models.find((item) => item.id === id);
    const localModelError = await validateLocalOllamaModel(body.provider ?? existing?.provider, body.modelId ?? existing?.modelId);
    if (localModelError) {
      send(response, 400, { message: localModelError });
      return true;
    }
    if (body.name !== undefined) {
      const conflict = findNameConflict(models, body.name, id);
      if (conflict) {
        send(response, 409, { message: `模型名称“${String(body.name).trim()}”已存在` });
        return true;
      }
    }
    const updated = models.map((item) => (item.id === id ? { ...item, ...body, id: item.id } : item));
    await writeJsonAtomic(dataPath(storagePaths.models), updated);
    send(response, 200, updated.find((item) => item.id === id));
    return true;
  }

  if (request.method === 'DELETE' && id) {
    await writeJsonAtomic(dataPath(storagePaths.models), models.filter((item) => item.id !== id));
    await appendLog({ type: '系统日志', level: 'warning', projectName: '全局', title: '模型配置已删除', detail: id });
    send(response, 200, { ok: true });
    return true;
  }

  if (request.method === 'POST' && id && action === 'check') {
    const model = models.find((item) => item.id === id);
    if (!model) {
      send(response, 404, { message: 'Model not found' });
      return true;
    }
    const checked = await checkModelHealth(model);
    await writeJsonAtomic(dataPath(storagePaths.models), models.map((item) => (item.id === id ? checked : item)));
    await appendLog({
      type: '模型调用',
      level: checked.healthy ? 'info' : 'warning',
      projectName: '全局',
      title: '模型健康检查完成',
      detail: `${checked.name}: ${checked.healthy ? '健康' : '异常'}`,
    });
    send(response, 200, checked);
    return true;
  }

  return false;
}
