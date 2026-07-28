import type http from 'node:http';
import { listResponse, parseBody, send } from '../http-utils.js';
import { applyFileChangeSet, generateFileChangeSet, listFileChangeSets, rejectFileChangeSet } from '../file-change-runtime.js';

export async function handleFileChangesRoute(request: http.IncomingMessage, response: http.ServerResponse, url: URL, id?: string, action?: string) {
  if (request.method === 'GET' && !id) {
    send(response, 200, listResponse(await listFileChangeSets(url.searchParams.get('projectId') ?? undefined), url));
    return true;
  }
  if (request.method === 'POST' && id === 'generate') {
    const body = await parseBody<{ projectId?: string; agentId?: string; task?: string; requiredPaths?: string[] }>(request);
    if (!body.projectId || !body.agentId || !body.task?.trim()) {
      send(response, 400, { message: '项目、Agent 和生成任务不能为空' });
      return true;
    }
    send(response, 201, await generateFileChangeSet(body.projectId, body.agentId, body.task, body.requiredPaths));
    return true;
  }
  if (request.method === 'POST' && id && action === 'apply') {
    const body = await parseBody<{ paths?: string[] }>(request);
    send(response, 200, await applyFileChangeSet(id, body.paths));
    return true;
  }
  if (request.method === 'POST' && id && action === 'reject') {
    send(response, 200, await rejectFileChangeSet(id));
    return true;
  }
  return false;
}
