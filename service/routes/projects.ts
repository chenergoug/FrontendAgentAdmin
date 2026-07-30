import { randomUUID } from 'node:crypto';
import type http from 'node:http';
import { nowText, storagePaths } from '../config.js';
import { includes, listResponse, parseBody, send } from '../http-utils.js';
import { exportPayload, findNameConflict, mergeById, normalizeProjectsImport, selectExportItems, validateImportUniqueNames } from '../import-export.js';
import { readProjectFileContent, readProjectFileTree } from '../project-files.js';
import { seedProjects } from '../seeds.js';
import { appendLog, dataPath, readJson, writeJsonAtomic } from '../storage.js';
import { deleteProjectSecrets, hasProjectDatabasePassword, setProjectDatabasePassword } from '../project-secrets.js';
import { listProjectTasks, readTaskLogs, startProjectTask, stopProjectTask } from '../task-manager.js';
import { listValidations, startValidation } from '../validation-runtime.js';
import type { ModelRecord, ProjectRecord, ProjectStatus, ProjectTaskType } from '../types.js';

type ProjectMutation = Partial<ProjectRecord> & { databasePassword?: string };

function validateServerConfiguration(project: Partial<ProjectRecord>, passwordConfigured: boolean) {
  if (project.shape === '纯前端') return [];
  const fields: Array<[unknown, string]> = [
    [project.serverUrl, '服务器地址'],
    [project.serverFramework, '服务端技术栈'],
    [project.serverRootPath, '服务端目录'],
    [project.serverDevCommand, '服务端运行命令'],
    [project.serverBuildCommand, '服务端构建命令'],
    [project.serverTestCommand, '服务端测试命令'],
    [project.databaseType, '数据库类型'],
    [project.databaseHost, '数据库主机'],
    [project.databasePort, '数据库端口'],
    [project.databaseName, '数据库名称'],
    [project.databaseUsername, '数据库账号'],
  ];
  const missing = fields.filter(([value]) => !String(value ?? '').trim()).map(([, label]) => label);
  if (!passwordConfigured) missing.push('数据库密码');
  const port = Number(project.databasePort);
  if (project.databasePort && (!Number.isInteger(port) || port < 1 || port > 65535)) missing.push('有效的数据库端口');
  return [...new Set(missing)];
}

function clearServerConfiguration<T extends Partial<ProjectRecord>>(project: T): T {
  return {
    ...project,
    serverFramework: '',
    serverRootPath: '',
    serverDevCommand: '',
    serverBuildCommand: '',
    serverTestCommand: '',
    serverUrl: '',
    databaseType: '',
    databaseHost: '',
    databasePort: '',
    databaseName: '',
    databaseUsername: '',
    databasePasswordConfigured: false,
  };
}

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
  const models = await readJson<ModelRecord[]>(storagePaths.models, []);

  const validateProjectModel = (modelName: string | undefined) =>
    models.some((item) => item.name === modelName && item.enabled)
      ? ''
      : `项目模型“${modelName || '未选择'}”不存在或未启用`;

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
    result.items.forEach((item, index) => {
      const modelError = validateProjectModel(item.modelName);
      if (modelError) result.errors.push(`第 ${index + 1} 条${modelError}`);
    });
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
      send(response, 200, { list: await listProjectTasks(id) });
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
      send(response, 200, { list: await readTaskLogs(subAction) });
      return true;
    }
  }

  if (id && action === 'validation') {
    const project = projects.find((item) => item.id === id);
    if (!project) {
      send(response, 404, { message: '项目不存在' });
      return true;
    }
    if (request.method === 'GET') {
      send(response, 200, { list: await listValidations(id) });
      return true;
    }
    if (request.method === 'POST' && subAction === 'start') {
      send(response, 201, await startValidation(project));
      return true;
    }
  }

  if (request.method === 'POST' && !id) {
    const body = await parseBody<ProjectMutation>(request);
    const requiredFields: Array<[keyof ProjectRecord, string]> = [
      ['name', '项目名称'],
      ['shape', '项目形态'],
      ['deviceType', '项目类型'],
      ['modelName', '项目模型'],
      ['rootPath', '项目路径'],
    ];
    const missingFields = requiredFields.filter(([key]) => !String(body[key] ?? '').trim()).map(([, label]) => label);
    missingFields.push(...validateServerConfiguration(body, Boolean(body.databasePassword?.trim())));
    const modelError = validateProjectModel(body.modelName);
    if (modelError) missingFields.push(modelError);
    if (missingFields.length > 0) {
      send(response, 400, { message: `请填写必填内容：${missingFields.join('、')}` });
      return true;
    }
    const projectName = String(body.name).trim();
    const conflict = findNameConflict(projects, projectName);
    if (conflict) {
      send(response, 409, { message: `项目名称“${String(projectName).trim()}”已存在` });
      return true;
    }
    let project: ProjectRecord = {
      id: `p-${randomUUID()}`,
      name: projectName,
      source: body.source ?? '新建',
      shape: body.shape ?? '纯前端',
      deviceType: body.deviceType ?? 'PC端',
      businessType: body.businessType ?? '',
      modelName: body.modelName ?? '',
      rootPath: body.rootPath ?? '',
      serverFramework: body.serverFramework ?? '',
      serverRootPath: body.serverRootPath ?? '',
      serverDevCommand: body.serverDevCommand ?? '',
      serverBuildCommand: body.serverBuildCommand ?? '',
      serverTestCommand: body.serverTestCommand ?? '',
      databaseType: body.databaseType ?? '',
      databaseHost: body.databaseHost ?? '',
      databasePort: body.databasePort ?? '',
      databaseName: body.databaseName ?? '',
      databaseUsername: body.databaseUsername ?? '',
      databasePasswordConfigured: body.shape !== '纯前端',
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
    if (project.shape === '纯前端') project = clearServerConfiguration(project);
    if (body.databasePassword?.trim()) await setProjectDatabasePassword(project.id, body.databasePassword);
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
    const body = await parseBody<ProjectMutation>(request);
    const { databasePassword, databasePasswordConfigured: _ignored, ...projectChanges } = body;
    if (projectChanges.name !== undefined) {
      const conflict = findNameConflict(projects, projectChanges.name, id);
      if (conflict) {
        send(response, 409, { message: `项目名称“${String(body.name).trim()}”已存在` });
        return true;
      }
    }
    const existing = projects.find((item) => item.id === id);
    if (!existing) {
      send(response, 404, { message: '项目不存在' });
      return true;
    }
    const nextShape = projectChanges.shape ?? existing.shape;
    const effectiveChanges = nextShape === '纯前端' ? clearServerConfiguration(projectChanges) : projectChanges;
    const passwordConfigured = nextShape === '纯前端'
      ? false
      : Boolean(databasePassword?.trim()) || await hasProjectDatabasePassword(id);
    const candidate = { ...existing, ...effectiveChanges, databasePasswordConfigured: passwordConfigured };
    const modelError = validateProjectModel(candidate.modelName);
    if (modelError) {
      send(response, 400, { message: modelError });
      return true;
    }
    const missingServerFields = validateServerConfiguration(candidate, passwordConfigured);
    if (missingServerFields.length > 0) {
      send(response, 400, { message: `请填写必填内容：${missingServerFields.join('、')}` });
      return true;
    }
    if (nextShape === '纯前端') await deleteProjectSecrets(id);
    else if (databasePassword?.trim()) await setProjectDatabasePassword(id, databasePassword);
    const updated = projects.map((item) =>
      item.id === id
        ? { ...item, ...effectiveChanges, databasePasswordConfigured: passwordConfigured, id: item.id, configVersion: item.configVersion + 1, updatedAt: nowText(), status: item.status === 'draft' ? 'ready' : item.status }
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
    await deleteProjectSecrets(id);
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
