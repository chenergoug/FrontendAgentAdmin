import type http from 'node:http';
import { includes, listResponse, send } from '../http-utils.js';
import { readLogs } from '../storage.js';

export async function handleLogsRoute(request: http.IncomingMessage, response: http.ServerResponse, url: URL) {
  if (request.method !== 'GET') return false;

  const logs = await readLogs();
  const keyword = url.searchParams.get('keyword') ?? '';
  const type = url.searchParams.get('type') ?? '';
  const level = url.searchParams.get('level') ?? '';
  send(
    response,
    200,
    listResponse(logs, url, (item) => (!keyword || includes(item.title, keyword) || includes(item.projectName, keyword)) && (!type || item.type === type) && (!level || item.level === level)),
  );
  return true;
}
