import type http from 'node:http';
import { parseBody, send } from '../http-utils.js';
import { approveWorkflowStage, getWorkflow, getWorkflowCapabilities, listWorkflowHistory, prepareWorkflowRerun, runWorkflowStage, stopProjectWorkflow, updateWorkflowMode, updateWorkflowStage } from '../workflow-runtime.js';
import type { WorkflowStageKey } from '../types.js';
import { cancelProjectOperations } from '../project-cancellation.js';

export async function handleWorkflowsRoute(request: http.IncomingMessage, response: http.ServerResponse, id?: string, action?: string, subAction?: string, extraAction?: string) {
  if (!id) return false;
  if (request.method === 'GET' && !action) {
    send(response, 200, await getWorkflow(id));
    return true;
  }
  if (request.method === 'GET' && action === 'capabilities') {
    send(response, 200, await getWorkflowCapabilities(id));
    return true;
  }
  if (request.method === 'GET' && action === 'history') {
    send(response, 200, { list: await listWorkflowHistory(id) });
    return true;
  }
  if (request.method === 'PUT' && action === 'mode') {
    const body = await parseBody<{ autoMode?: boolean }>(request);
    send(response, 200, await updateWorkflowMode(id, Boolean(body.autoMode)));
    return true;
  }
  if (request.method === 'POST' && action === 'stop') {
    cancelProjectOperations(id);
    send(response, 200, await stopProjectWorkflow(id));
    return true;
  }
  if (action === 'stages' && subAction) {
    const stageKey = subAction as WorkflowStageKey;
    if (request.method === 'POST' && extraAction === 'run') {
      const body = await parseBody<{ input?: string }>(request);
      try {
        send(response, 200, await runWorkflowStage(id, stageKey, body.input));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('正在执行')) {
          send(response, 409, { message });
          return true;
        }
        throw error;
      }
      return true;
    }
    if (request.method === 'POST' && extraAction === 'rerun') {
      const body = await parseBody<{ reason?: string }>(request);
      send(response, 200, await prepareWorkflowRerun(id, stageKey, body.reason ?? ''));
      return true;
    }
    if (request.method === 'PUT' && extraAction === 'artifact') {
      const body = await parseBody<{ output?: string }>(request);
      send(response, 200, await updateWorkflowStage(id, stageKey, body.output ?? ''));
      return true;
    }
    if (request.method === 'POST' && extraAction === 'approve') {
      send(response, 200, await approveWorkflowStage(id, stageKey));
      return true;
    }
  }
  return false;
}
