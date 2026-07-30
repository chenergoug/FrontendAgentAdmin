import type http from 'node:http';
import { defaultDataDir, storagePaths } from '../config.js';
import { includes, listResponse, parseBody, send } from '../http-utils.js';
import { createSeedSettings } from '../seeds.js';
import { appendLog, dataPath, readJson, writeJsonAtomic } from '../storage.js';
import type { SettingRecord } from '../types.js';

export async function handleSettingsRoute(request: http.IncomingMessage, response: http.ServerResponse, url: URL, id?: string) {
  const settings = await readJson<SettingRecord[]>(storagePaths.settings, createSeedSettings(defaultDataDir));

  if (request.method === 'GET' && !id) {
    const keyword = url.searchParams.get('keyword') ?? '';
    const group = url.searchParams.get('group') ?? '';
    send(response, 200, listResponse(settings, url, (item) => (!keyword || includes(item.name, keyword) || includes(item.description, keyword)) && (!group || item.group === group)));
    return true;
  }

  if (request.method === 'PUT' && id) {
    const body = await parseBody<Partial<SettingRecord>>(request);
    const existing = settings.find((item) => item.id === id);
    if (!existing) {
      send(response, 404, { message: '系统配置不存在' });
      return true;
    }
    const booleanPairs = [['开启', '关闭'], ['启用', '停用'], ['是', '否']];
    const pair = booleanPairs.find((item) => item.includes(existing.value));
    if (pair && body.value !== undefined && !pair.includes(body.value)) {
      send(response, 400, { message: `配置值只能选择“${pair[0]}”或“${pair[1]}”` });
      return true;
    }
    const updated = settings.map((item) => (item.id === id ? { ...item, ...body, id: item.id } : item));
    await writeJsonAtomic(dataPath(storagePaths.settings), updated);
    await appendLog({
      type: '系统日志',
      level: 'info',
      projectName: '全局',
      title: '系统配置已更新',
      detail: updated.find((item) => item.id === id)?.name ?? id,
    });
    send(response, 200, updated.find((item) => item.id === id));
    return true;
  }

  return false;
}
