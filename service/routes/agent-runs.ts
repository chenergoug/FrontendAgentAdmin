import type http from 'node:http';
import { listResponse, parseBody, send } from '../http-utils.js';
import { listAgentRuns, readAgentRunLogs, startAgentRun } from '../agent-runtime.js';

export async function handleAgentRunsRoute(request: http.IncomingMessage, response: http.ServerResponse, url: URL, id?: string, action?: string) {
  if (request.method === 'GET' && !id) {
    const projectId = url.searchParams.get('projectId') ?? undefined;
    const runs = await listAgentRuns(projectId);
    send(response, 200, listResponse(runs, url));
    return true;
  }

  if (request.method === 'POST' && !id) {
    const body = await parseBody<{ projectId?: string; agentId?: string; input?: string }>(request);
    if (!body.projectId || !body.agentId || !body.input) {
      send(response, 400, { message: '项目、Agent 和任务说明不能为空' });
      return true;
    }
    send(response, 201, await startAgentRun({ projectId: body.projectId, agentId: body.agentId, input: body.input }));
    return true;
  }

  if (request.method === 'GET' && id && action === 'logs') {
    send(response, 200, { list: await readAgentRunLogs(id) });
    return true;
  }

  return false;
}
