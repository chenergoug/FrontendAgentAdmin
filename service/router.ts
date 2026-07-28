import type http from 'node:http';
import { defaultDataDir, port } from './config.js';
import { send } from './http-utils.js';
import { handleAgentsRoute } from './routes/agents.js';
import { handleBootstrapRoute } from './routes/bootstrap.js';
import { handleDashboardRoute } from './routes/dashboard.js';
import { handleLogsRoute } from './routes/logs.js';
import { handleModelsRoute } from './routes/models.js';
import { handleProjectsRoute } from './routes/projects.js';
import { handleRecoveryRoute } from './routes/recovery.js';
import { handleSettingsRoute } from './routes/settings.js';

export async function handleApiRequest(request: http.IncomingMessage, response: http.ServerResponse) {
  if (request.method === 'OPTIONS') {
    send(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
  const segments = url.pathname.split('/').filter(Boolean);
  const [api, resource, id, action, subAction, extraAction] = segments;

  if (api !== 'api') {
    send(response, 404, { message: 'Not found' });
    return;
  }

  if (resource === 'health') {
    send(response, 200, { service: 'frontend-agent-admin-service', status: 'ok', dataDir: defaultDataDir });
    return;
  }

  const handled =
    (resource === 'bootstrap' && (await handleBootstrapRoute(request, response, id))) ||
    (resource === 'dashboard' && (await handleDashboardRoute(request, response))) ||
    (resource === 'projects' && (await handleProjectsRoute(request, response, url, id, action, subAction, extraAction))) ||
    (resource === 'models' && (await handleModelsRoute(request, response, url, id, action))) ||
    (resource === 'agents' && (await handleAgentsRoute(request, response, url, id))) ||
    (resource === 'settings' && (await handleSettingsRoute(request, response, url, id))) ||
    (resource === 'logs' && (await handleLogsRoute(request, response, url))) ||
    (resource === 'recovery' && (await handleRecoveryRoute(request, response, url, id, action)));

  if (!handled) {
    send(response, 404, { message: 'Not found' });
  }
}
