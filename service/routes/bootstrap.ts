import type http from 'node:http';
import path from 'node:path';
import { defaultDataDir, storagePaths } from '../config.js';
import { parseBody, send } from '../http-utils.js';
import { appendLog, dataPath, readJson, writeJsonAtomic } from '../storage.js';
import type { JsonMap } from '../types.js';

export async function handleBootstrapRoute(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  id?: string,
) {
  if (request.method === 'GET' && !id) {
    const appConfig = await readJson<JsonMap>(storagePaths.appConfig, {});
    const pathConfig = await readJson<JsonMap>(storagePaths.pathConfig, {});
    send(response, 200, { appConfig, pathConfig, dataDir: defaultDataDir });
    return true;
  }

  if (request.method === 'POST' && id === 'data-dir') {
    const body = await parseBody<{ dataDir?: string }>(request);
    if (!body.dataDir) {
      send(response, 400, { message: 'dataDir is required' });
      return true;
    }
    await writeJsonAtomic(dataPath(storagePaths.pathConfig), {
      dataDir: body.dataDir,
      configDir: path.join(body.dataDir, 'system'),
      logDir: path.join(body.dataDir, 'logs'),
    });
    await appendLog({
      type: '系统日志',
      level: 'info',
      projectName: '全局',
      title: '数据目录配置已更新',
      detail: body.dataDir,
    });
    send(response, 200, { dataDir: body.dataDir });
    return true;
  }

  return false;
}
