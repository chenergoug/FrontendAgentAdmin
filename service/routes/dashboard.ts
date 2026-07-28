import type http from 'node:http';
import { storagePaths } from '../config.js';
import { send } from '../http-utils.js';
import { seedAgentUsage, seedModelUsage, seedModels, seedProjects, seedRecovery } from '../seeds.js';
import { readJson } from '../storage.js';
import type { ModelRecord, ProjectRecord, RecoveryRecord } from '../types.js';

export async function handleDashboardRoute(request: http.IncomingMessage, response: http.ServerResponse) {
  if (request.method !== 'GET') return false;

  const [projects, models, recovery, modelUsage, agentUsage] = await Promise.all([
    readJson<ProjectRecord[]>(storagePaths.projects, seedProjects),
    readJson<ModelRecord[]>(storagePaths.models, seedModels),
    readJson<RecoveryRecord[]>(storagePaths.recovery, seedRecovery),
    readJson(storagePaths.modelUsage, seedModelUsage),
    readJson(storagePaths.agentUsage, seedAgentUsage),
  ]);

  send(response, 200, {
    stats: {
      projectTotal: projects.length,
      runningProjectTotal: projects.filter((item) => item.status === 'running').length,
      enabledModelTotal: models.filter((item) => item.enabled).length,
      pendingRecoveryTotal: recovery.filter((item) => item.status === '待处理').length,
    },
    modelUsage,
    agentUsage,
    recentProjects: projects.slice(0, 5),
    pendingRecovery: recovery.filter((item) => item.status === '待处理').slice(0, 5),
  });
  return true;
}
