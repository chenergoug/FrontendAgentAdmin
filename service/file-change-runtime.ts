import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Script } from 'node:vm';
import { nowText, storagePaths } from './config.js';
import { startAgentRun } from './agent-runtime.js';
import { readProjectFileTree } from './project-files.js';
import { dataPath, readJson, writeJsonAtomic } from './storage.js';
import type { FileChangeAction, FileChangeItem, FileChangeSet, ProjectFileNode, ProjectRecord } from './types.js';
import { createBasicAdminTemplate, createDroneReactTemplate, createVueExpressMysqlBackendTemplate, createVueExpressMysqlTemplate, createVueJavaMysqlBackendTemplate, createVueJavaMysqlTemplate } from './project-templates.js';

const blockedPaths = new Set(['.env', '.env.local', '.git/config', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
const maxFiles = 100;
const maxFileLines = 500;
const maxFileCharacters = 80000;

function containsProjectFile(nodes: ProjectFileNode[]): boolean {
  return nodes.some((node) => node.type === 'file' || containsProjectFile(node.children ?? []));
}

type RawGeneratedFile = { path?: string; filePath?: string; filepath?: string; name?: string; action?: FileChangeAction; content?: unknown };
type GeneratedPayload = { summary?: string; files?: unknown[] };

function normalizeRelativePath(value: string) {
  const source = value.replaceAll('\\', '/').replace(/^\.\//, '');
  const normalized = ['.env', '.env.local'].includes(source.toLowerCase()) ? '.env.example' : source;
  if (!normalized) throw new Error('模型返回的文件变更缺少 path 字段，请重新生成当前节点');
  if (path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) throw new Error(`不安全的文件路径：${value}`);
  if (blockedPaths.has(normalized.toLowerCase()) || normalized.startsWith('.git/')) throw new Error(`禁止修改敏感文件：${normalized}`);
  return normalized;
}

function normalizeGeneratedFiles(value: unknown[]): RawGeneratedFile[] {
  const files: RawGeneratedFile[] = [];
  let pending: Record<string, unknown> | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      if (pending && Object.keys(pending).length > 0) files.push(pending as RawGeneratedFile);
      pending = null;
      files.push(item as RawGeneratedFile);
      continue;
    }
    if (typeof item === 'string') {
      const key = item;
      const next = value[index + 1];
      if (['path', 'filePath', 'filepath', 'name', 'action', 'content'].includes(key)) {
        pending ??= {};
        pending[key] = next;
        index += 1;
        if (key === 'content') {
          files.push(pending as RawGeneratedFile);
          pending = null;
        }
      }
    }
  }
  if (pending && Object.keys(pending).length > 0) files.push(pending as RawGeneratedFile);
  return files;
}

function resolveProjectFile(project: ProjectRecord, relativePath: string) {
  const root = path.resolve(project.rootPath);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`文件路径越出项目目录：${relativePath}`);
  return target;
}

function parsePayload(text: string): GeneratedPayload {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned) as GeneratedPayload;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as GeneratedPayload;
    throw new Error('模型没有返回有效的 JSON 变更集');
  }
}

async function readOriginal(project: ProjectRecord, relativePath: string) {
  try { return await readFile(resolveProjectFile(project, relativePath), 'utf8'); } catch { return ''; }
}

async function saveChangeSet(changeSet: FileChangeSet) {
  const all = await readJson<FileChangeSet[]>(storagePaths.fileChanges, []);
  await writeJsonAtomic(dataPath(storagePaths.fileChanges), [changeSet, ...all.filter((item) => item.id !== changeSet.id)]);
  return changeSet;
}

export async function listFileChangeSets(projectId?: string) {
  const all = await readJson<FileChangeSet[]>(storagePaths.fileChanges, []);
  return projectId ? all.filter((item) => item.projectId === projectId) : all;
}

function shouldUseJavaBackendTemplate(projectContext: string) {
  return /(?:^|[^\w])java(?:[^\w]|$)|jdk|spring\s*boot|(?:非|不使用|不要|不用)\s*node/i.test(projectContext);
}

function shouldUseDatabaseTemplate(projectContext: string, project: ProjectRecord) {
  return Boolean(project.databaseType || project.databaseName)
    || /mysql|postgres(?:ql)?|sqlite|mongodb|mariadb|sql\b|database|数据库|数据表|建表|连接数据库|测试数据|持久化|全栈|后端|服务端|前后端/i.test(projectContext);
}

export async function generateFileChangeSet(projectId: string, agentId: string, task: string, requiredPaths: string[] = []) {
  const projects = await readJson<ProjectRecord[]>(storagePaths.projects, []);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const existingTree = await readProjectFileTree(project);
  const projectHasFiles = containsProjectFile(existingTree);
  const projectContext = [
    task,
    project.name,
    project.description,
    project.requirement,
    project.constraints,
    project.businessType,
    project.serverFramework,
    project.databaseType,
    project.databaseName,
    project.serverUrl,
  ].filter(Boolean).join('\n');
  const cleanNeedsJavaBackend = shouldUseJavaBackendTemplate(projectContext);
  const cleanNeedsFullstackDatabase = shouldUseDatabaseTemplate(projectContext, project);
  if (agentId === 'a-frontend' && !projectHasFiles && cleanNeedsJavaBackend && cleanNeedsFullstackDatabase) {
    const files = createVueJavaMysqlTemplate(project.databaseName || 'frontend_agent_admin_java_demo');
    return saveChangeSet({ id: `fc-${randomUUID()}`, projectId, projectName: project.name, agentRunId: 'template-vue-java-mysql', summary: 'Vue 3 + Java + MySQL 非 Node 后端基线模板', status: 'pending', files, error: '', createdAt: nowText(), appliedAt: '' });
  }
  if (agentId === 'a-backend' && cleanNeedsJavaBackend && cleanNeedsFullstackDatabase) {
    const files = createVueJavaMysqlBackendTemplate(project.databaseName || 'frontend_agent_admin_java_demo');
    return saveChangeSet({ id: `fc-${randomUUID()}`, projectId, projectName: project.name, agentRunId: 'template-vue-java-mysql-backend', summary: 'Java + MySQL 非 Node 后端基线模板', status: 'pending', files, error: '', createdAt: nowText(), appliedAt: '' });
  }
  if (agentId === 'a-frontend' && !projectHasFiles && /无人机|WebGL|Three\.js/i.test(task)) {
    const files = createDroneReactTemplate();
    return saveChangeSet({ id: `fc-${randomUUID()}`, projectId, projectName: project.name, agentRunId: 'template-react-drone', summary: 'React + Ant Design + Three.js 无人机项目基线模板', status: 'pending', files, error: '', createdAt: nowText(), appliedAt: '' });
  }
  if (agentId === 'a-frontend' && !projectHasFiles && /后台管理/i.test(task) && /登录/i.test(task) && /首页/i.test(task) && /Node/i.test(task)) {
    if (/Node|Express|MySQL|数据库|全栈|后端|服务端|前后端/i.test(projectContext) || Boolean(project.databaseType || project.databaseName)) {
      const files = createVueExpressMysqlTemplate(project.databaseName || 'frontend_agent_admin_demo');
      return saveChangeSet({ id: `fc-${randomUUID()}`, projectId, projectName: project.name, agentRunId: 'template-vue-express-mysql', summary: 'Vue 3 + Express + MySQL 全栈后台管理基线模板', status: 'pending', files, error: '', createdAt: nowText(), appliedAt: '' });
    }
    const files = createBasicAdminTemplate();
    return saveChangeSet({ id: `fc-${randomUUID()}`, projectId, projectName: project.name, agentRunId: 'template-basic-admin', summary: 'React + Ant Design + Node 后台管理基线模板', status: 'pending', files, error: '', createdAt: nowText(), appliedAt: '' });
  }
  if (
    agentId === 'a-frontend'
    && !projectHasFiles
    && (/Node|Express|MySQL|数据库|全栈|后端|服务端|前后端/i.test(projectContext) || Boolean(project.databaseType || project.databaseName))
  ) {
    const files = createVueExpressMysqlTemplate(project.databaseName || 'frontend_agent_admin_demo');
    return saveChangeSet({ id: `fc-${randomUUID()}`, projectId, projectName: project.name, agentRunId: 'template-vue-express-mysql', summary: 'Vue 3 + Express + MySQL 全栈后台管理基线模板', status: 'pending', files, error: '', createdAt: nowText(), appliedAt: '' });
  }
  if (
    agentId === 'a-backend'
    && /Node|Express|MySQL|数据库|全栈|后端|服务端|前后端/i.test(projectContext)
  ) {
    const files = createVueExpressMysqlBackendTemplate(project.databaseName || 'frontend_agent_admin_demo');
    return saveChangeSet({ id: `fc-${randomUUID()}`, projectId, projectName: project.name, agentRunId: 'template-vue-express-mysql-backend', summary: 'Express + MySQL 后端与数据库基线模板', status: 'pending', files, error: '', createdAt: nowText(), appliedAt: '' });
  }
  const instruction = [
    task,
    '输出 JSON Schema：{"summary":"说明","files":[{"path":"相对路径","action":"create|update|delete","content":"文件完整内容"}]}。',
    '每个文件必须提供完整内容，不使用省略号。单文件不超过 500 行；页面、组件、hooks、api、types 和服务必须拆分。',
    '所有外部 import 必须在 package.json、pubspec.yaml、go.mod、pom.xml 或对应依赖清单中声明；框架插件、路由、状态管理和测试依赖不得遗漏。',
    '项目入口必须完整：Vite 项目包含 index.html 并正确挂载应用与路由；生成前检查配置文件引用、依赖清单和源码 import 一致。',
    '环境变量模板只能输出 .env.example，不得输出 .env 或 .env.local；禁止输出 Git 配置和依赖锁文件，禁止绝对路径与 .. 路径。',
  ].join('\n');
  const run = await startAgentRun({ projectId, agentId, input: instruction, structured: true });
  if (run.status !== 'success') throw new Error(run.error || '代码生成 Agent 执行失败');
  const payload = parsePayload(run.output);
  if (!Array.isArray(payload.files) || payload.files.length === 0) throw new Error('模型返回的文件变更集为空');
  const generatedFiles = normalizeGeneratedFiles(payload.files);
  if (generatedFiles.length === 0) throw new Error('模型返回的文件变更集无法解析，请重新生成当前节点');
  if (generatedFiles.length > maxFiles) throw new Error(`单次最多生成 ${maxFiles} 个文件`);
  const files: FileChangeItem[] = [];
  for (const raw of generatedFiles) {
    const relativePath = normalizeRelativePath(String(raw.path ?? raw.filePath ?? raw.filepath ?? raw.name ?? ''));
    const action = raw.action;
    if (!action || !['create', 'update', 'delete'].includes(action)) throw new Error(`文件 ${relativePath} 的操作类型无效`);
    const content = action === 'delete' ? '' : typeof raw.content === 'string' ? raw.content : JSON.stringify(raw.content ?? '', null, 2);
    if (content.length > maxFileCharacters || content.split(/\r?\n/).length > maxFileLines) throw new Error(`文件 ${relativePath} 超出单文件限制，请拆分后重新生成`);
    if (action !== 'delete' && path.posix.basename(relativePath) === '.eslintrc.js') {
      try {
        new Script(content, { filename: relativePath });
      } catch (error) {
        throw new Error(`模型生成的 ${relativePath} 存在 JavaScript 语法错误：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    files.push({ path: relativePath, action, content, originalContent: await readOriginal(project, relativePath), selected: true });
  }
  const generatedPaths = new Set(files.map((item) => item.path.toLowerCase()));
  const missingPaths = requiredPaths.map(normalizeRelativePath).filter((item) => !generatedPaths.has(item.toLowerCase()));
  if (missingPaths.length > 0) throw new Error(`模型输出不完整，缺少必需文件：${missingPaths.join('、')}`);
  return saveChangeSet({ id: `fc-${randomUUID()}`, projectId, projectName: project.name, agentRunId: run.id, summary: payload.summary ?? task, status: 'pending', files, error: '', createdAt: nowText(), appliedAt: '' });
}

export async function applyFileChangeSet(id: string, selectedPaths?: string[]) {
  const all = await readJson<FileChangeSet[]>(storagePaths.fileChanges, []);
  const changeSet = all.find((item) => item.id === id);
  if (!changeSet) throw new Error('文件变更集不存在');
  if (changeSet.status !== 'pending') throw new Error('文件变更集已处理');
  const projects = await readJson<ProjectRecord[]>(storagePaths.projects, []);
  const project = projects.find((item) => item.id === changeSet.projectId);
  if (!project) throw new Error('项目不存在');
  const selected = selectedPaths ? new Set(selectedPaths) : null;
  const files = changeSet.files.filter((item) => !selected || selected.has(item.path));
  if (files.length === 0) throw new Error('请选择需要应用的文件');
  const backupRoot = dataPath(`projects/backups/${project.id}/${changeSet.id}`);
  for (const file of files) {
    const target = resolveProjectFile(project, file.path);
    if (file.originalContent) {
      const backup = path.join(backupRoot, file.path);
      await mkdir(path.dirname(backup), { recursive: true });
      await writeFile(backup, file.originalContent, 'utf8');
    }
    if (file.action === 'delete') await rm(target, { force: true });
    else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf8');
    }
  }
  await writeJsonAtomic(path.join(backupRoot, 'manifest.json'), { changeSetId: id, projectId: project.id, files: files.map((item) => ({ path: item.path, action: item.action })), createdAt: nowText() });
  return saveChangeSet({ ...changeSet, status: 'applied', appliedAt: nowText(), files: changeSet.files.map((item) => ({ ...item, selected: files.some((file) => file.path === item.path) })) });
}

export async function rejectFileChangeSet(id: string) {
  const all = await readJson<FileChangeSet[]>(storagePaths.fileChanges, []);
  const changeSet = all.find((item) => item.id === id);
  if (!changeSet) throw new Error('文件变更集不存在');
  return saveChangeSet({ ...changeSet, status: 'rejected' });
}
