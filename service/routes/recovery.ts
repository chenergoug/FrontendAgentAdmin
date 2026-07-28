import type http from 'node:http';
import { storagePaths } from '../config.js';
import { includes, listResponse, send } from '../http-utils.js';
import { seedRecovery } from '../seeds.js';
import { appendLog, dataPath, readJson, writeJsonAtomic } from '../storage.js';
import type { RecoveryRecord, RecoveryStatus } from '../types.js';

export async function handleRecoveryRoute(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  url: URL,
  id?: string,
  action?: string,
) {
  const recovery = await readJson<RecoveryRecord[]>(storagePaths.recovery, seedRecovery);

  if (request.method === 'GET' && !id) {
    const keyword = url.searchParams.get('keyword') ?? '';
    const type = url.searchParams.get('type') ?? '';
    const status = url.searchParams.get('status') ?? '';
    send(
      response,
      200,
      listResponse(recovery, url, (item) => (!keyword || includes(item.title, keyword) || includes(item.projectName, keyword)) && (!type || item.type === type) && (!status || item.status === status)),
    );
    return true;
  }

  if (request.method === 'POST' && id && action === 'resolve') {
    const updated = recovery.map((item) => (item.id === id ? { ...item, status: '已处理' as RecoveryStatus } : item));
    await writeJsonAtomic(dataPath(storagePaths.recovery), updated);
    await appendLog({ type: '系统日志', level: 'info', projectName: '全局', title: '恢复项已处理', detail: id });
    send(response, 200, updated.find((item) => item.id === id));
    return true;
  }

  if (request.method === 'DELETE' && id) {
    await writeJsonAtomic(dataPath(storagePaths.recovery), recovery.filter((item) => item.id !== id));
    await appendLog({ type: '系统日志', level: 'warning', projectName: '全局', title: '恢复项已删除', detail: id });
    send(response, 200, { ok: true });
    return true;
  }

  return false;
}
