import { randomUUID } from 'node:crypto';
import type http from 'node:http';
import { nowText, storagePaths } from '../config.js';
import { includes, listResponse, parseBody, send } from '../http-utils.js';
import { exportPayload, findNameConflict, mergeById, normalizeProjectsImport, selectExportItems, validateImportUniqueNames } from '../import-export.js';
import { readProjectFileContent, readProjectFileTree } from '../project-files.js';
import { seedProjects } from '../seeds.js';
import { appendLog, dataPath, readJson, writeJsonAtomic } from '../storage.js';
import { listProjectTasks, readTaskLogs, startProjectTask, stopProjectTask } from '../task-manager.js';
import type { ProjectRecord, ProjectStatus, ProjectTaskType } from '../types.js';

function applyProjectStatus(projects: ProjectRecord[], projectId: string, status: ProjectStatus) {
  return projects.map((item) => (item.id === projectId ? { ...item, status, updatedAt: nowText() } : item));
}

export async function handleProjectsRoute(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  url: URL,
  id?: string,
  action?: string,
  subAction?: string,
  extraAction?: string,
) {
  const projects = await readJson<ProjectRecord[]>(storagePaths.projects, seedProjects);

  if (request.method === 'GET' && id === 'export') {
    const selected = selectExportItems(projects, url);
    if (selected.errors.length > 0) {
      send(response, 400, { message: '项目导出失败', errors: selected.errors });
      return true;
    }
    send(response, 200, exportPayload('projects', selected.items));
    return true;
  }

  if (request.method === 'POST' && id === 'import') {
    const body = await parseBody<Partial<ProjectRecord>[] | { items?: Partial<ProjectRecord>[] }>(request);
    const result = normalizeProjectsImport(body);
    if (result.errors.length > 0) {
      send(response, 400, { message: '项目导入失败', errors: result.errors });
      return true;
    }
    const uniqueErrors = validateImportUniqueNames('项目', projects, result.items);
    if (uniqueErrors.length > 0) {
      send(response, 400, { message: '项目导入失败', errors: uniqueErrors });
      return true;
    }
    const merged = mergeById(projects, result.items);
    await writeJsonAtomic(dataPath(storagePaths.projects), merged);
    await appendLog({
      type: '项目日志',
      level: 'info',
      projectName: '全局',
      title: '项目配置已导入',
      detail: `导入 ${result.items.length} 条项目配置`,
    });
    send(response, 200, { imported: result.items.length, total: merged.length });
    return true;
  }

  if (request.method === 'GET' && !id) {
    const keyword = url.searchParams.get('keyword') ?? '';
    const shape = url.searchParams.get('shape') ?? '';
    const deviceType = url.searchParams.get('deviceType') ?? '';
    const status = url.searchParams.get('status') ?? '';
    send(
      response,
      200,
      listResponse(projects, url, (item) => {
        const matchedKeyword =
          !keyword || includes(item.name, keyword) || includes(item.gitRemote, keyword) || includes(item.rootPath, keyword);
        return matchedKeyword && (!shape || item.shape === shape) && (!deviceType || item.deviceType === deviceType) && (!status || item.status === status);
      }),
    );
    return true;
  }

  if (request.method === 'GET' && id && !action) {
    send(response, 200, projects.find((item) => item.id === id) ?? null);
    return true;
  }

  if (id && action === 'files') {
    const project = projects.find((item) => item.id === id);
    if (!project) {
      send(response, 404, { message: '项目不存在' });
      return true;
    }

    if (request.method === 'GET' && subAction === 'tree') {
      send(response, 200, { list: await readProjectFileTree(project) });
      return true;
    }

    if (request.method === 'GET' && subAction === 'content') {
      const filePath = url.searchParams.get('path') ?? '';
      send(response, 200, await readProjectFileContent(project, filePath));
      return true;
    }
  }

  if (id && action === 'tasks') {
    const project = projects.find((item) => item.id === id);
    if (!project) {
      send(response, 404, { message: '项目不存在' });
      return true;
    }

    if (request.method === 'GET' && !subAction) {
      send(response, 200, { list: listProjectTasks(id) });
      return true;
    }

    if (request.method === 'POST' && subAction === 'start') {
      const body = await parseBody<{ type?: ProjectTaskType; command?: string }>(request);
      const type = body.type ?? 'dev';
      if (!['dev', 'build', 'lint', 'test'].includes(type)) {
        send(response, 400, { message: '任务类型不支持' });
        return true;
      }
      send(response, 201, startProjectTask(project, type, body.command));
      return true;
    }

    if (request.method === 'POST' && subAction && extraAction === 'stop') {
      send(response, 200, stopProjectTask(id, subAction));
      return true;
    }

    if (request.method === 'GET' && subAction && extraAction === 'logs') {
      send(response, 200, { list: readTaskLogs(subAction) });
      return true;
    }
  }

  if (request.method === 'POST' && !id) {
    const body = await parseBody<Partial<ProjectRecord>>(request);
    const projectName = body.name ?? '未命名项目';
    const conflict = findNameConflict(projects, projectName);
    if (conflict) {
      send(response, 409, { message: `项目名称“${String(projectName).trim()}”已存在` });
      return true;
    }
    const project: ProjectRecord = {
      id: `p-${randomUUID()}`,
      name: projectName,
      source: body.source ?? '新建',
      shape: body.shape ?? '纯前端',
      deviceType: body.deviceType ?? 'PC端',
      businessType: body.businessType ?? '',
      rootPath: body.rootPath ?? '',
      gitRemote: body.gitRemote ?? '',
      branch: body.branch ?? 'develop',
      serverUrl: body.serverUrl ?? '',
      devCommand: body.devCommand ?? 'pnpm dev',
      buildCommand: body.buildCommand ?? 'pnpm build',
      lintCommand: body.lintCommand ?? 'pnpm lint',
      testCommand: body.testCommand ?? 'pnpm test',
      configVersion: 1,
      status: 'ready',
      updatedAt: nowText(),
      description: body.description ?? '',
      requirement: body.requirement ?? '',
    };
    await writeJsonAtomic(dataPath(storagePaths.projects), [project, ...projects]);
    await appendLog({
      type: '项目日志',
      level: 'info',
      projectName: project.name,
      title: '项目已创建',
      detail: `项目配置版本 v${project.configVersion}`,
    });
    send(response, 201, project);
    return true;
  }

  if (request.method === 'PUT' && id) {
    const body = await parseBody<Partial<ProjectRecord>>(request);
    if (body.name !== undefined) {
      const conflict = findNameConflict(projects, body.name, id);
      if (conflict) {
        send(response, 409, { message: `项目名称“${String(body.name).trim()}”已存在` });
        return true;
      }
    }
    const updated = projects.map((item) =>
      item.id === id
        ? { ...item, ...body, id: item.id, configVersion: item.configVersion + 1, updatedAt: nowText(), status: item.status === 'draft' ? 'ready' : item.status }
        : item,
    );
    const project = updated.find((item) => item.id === id);
    await writeJsonAtomic(dataPath(storagePaths.projects), updated);
    await appendLog({
      type: '项目日志',
      level: 'info',
      projectName: project?.name ?? '未知项目',
      title: '项目配置已更新',
      detail: `配置版本 v${project?.configVersion ?? 0}`,
    });
    send(response, 200, project);
    return true;
  }

  if (request.method === 'DELETE' && id) {
    const project = projects.find((item) => item.id === id);
    await writeJsonAtomic(dataPath(storagePaths.projects), projects.filter((item) => item.id !== id));
    await appendLog({
      type: '项目日志',
      level: 'warning',
      projectName: project?.name ?? '未知项目',
      title: '项目已从列表删除',
      detail: '仅删除平台配置，不删除本地代码文件。',
    });
    send(response, 200, { ok: true });
    return true;
  }

  if (request.method === 'POST' && id && (action === 'open' || action === 'close')) {
    const status: ProjectStatus = action === 'open' ? 'running' : 'ready';
    const updated = applyProjectStatus(projects, id, status);
    await writeJsonAtomic(dataPath(storagePaths.projects), updated);
    send(response, 200, updated.find((item) => item.id === id));
    return true;
  }

  if (request.method === 'POST' && id && action === 'client' && (subAction === 'open' || subAction === 'close')) {
    const project = projects.find((item) => item.id === id);
    if (!project) {
      send(response, 404, { message: '项目不存在' });
      return true;
    }
    if (subAction === 'open' && project.status === 'running') {
      send(response, 409, { message: '该项目子客户端已在运行中，请先关闭后再打开' });
      return true;
    }
    const status: ProjectStatus = subAction === 'open' ? 'running' : 'ready';
    const changed = project.status !== status;
    const updated = changed ? applyProjectStatus(projects, id, status) : projects;
    await writeJsonAtomic(dataPath(storagePaths.projects), updated);
    if (changed) {
      await appendLog({
      type: '项目日志',
      level: 'info',
      projectName: updated.find((item) => item.id === id)?.name ?? '未知项目',
      title: subAction === 'open' ? '子客户端已打开' : '子客户端已关闭',
      detail: `projectId=${id}`,
      });
    }
    send(response, 200, updated.find((item) => item.id === id));
    return true;
  }

  if (request.method === 'GET' && id && action === 'client' && subAction === 'status') {
    const project = projects.find((item) => item.id === id);
    send(response, 200, {
      projectId: id,
      running: project?.status === 'running',
      status: project?.status ?? 'error',
      updatedAt: project?.updatedAt ?? '',
    });
    return true;
  }

  return false;
}
