import { randomUUID } from 'node:crypto';
import type http from 'node:http';
import { storagePaths } from '../config.js';
import { includes, listResponse, parseBody, send } from '../http-utils.js';
import { exportPayload, findNameConflict, mergeById, normalizeModelsImport, selectExportItems, validateImportUniqueNames } from '../import-export.js';
import { checkModelHealth } from '../model-health.js';
import { seedModels } from '../seeds.js';
import { appendLog, dataPath, readJson, writeJsonAtomic } from '../storage.js';
import type { ModelRecord } from '../types.js';

export async function handleModelsRoute(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  url: URL,
  id?: string,
  action?: string,
) {
  const models = await readJson<ModelRecord[]>(storagePaths.models, seedModels);

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
