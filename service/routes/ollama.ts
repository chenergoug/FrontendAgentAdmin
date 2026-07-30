import type http from 'node:http';
import { send } from '../http-utils.js';
import { defaultOllamaBaseUrl, getOllamaStatus, listOllamaModels } from '../ollama-client.js';
import { inspectOllamaSetup } from '../ollama-installer.js';

export async function handleOllamaRoute(request: http.IncomingMessage, response: http.ServerResponse, url: URL, action?: string) {
  const baseUrl = url.searchParams.get('baseUrl') ?? defaultOllamaBaseUrl;

  if (request.method === 'GET' && (!action || action === 'status')) {
    send(response, 200, await getOllamaStatus(baseUrl));
    return true;
  }

  if (request.method === 'GET' && action === 'models') {
    send(response, 200, { list: await listOllamaModels(baseUrl) });
    return true;
  }

  if (request.method === 'GET' && action === 'setup') {
    send(response, 200, await inspectOllamaSetup());
    return true;
  }

  return false;
}
