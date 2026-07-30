import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nowText, storagePaths } from './config.js';
import { startAgentRun } from './agent-runtime.js';
import { readProjectFileTree } from './project-files.js';
import { dataPath, readJson, writeJsonAtomic } from './storage.js';
import type { FileChangeAction, FileChangeItem, FileChangeSet, ProjectFileNode, ProjectRecord } from './types.js';
import { createBasicAdminTemplate, createDroneReactTemplate } from './project-templates.js';

const blockedPaths = new Set(['.env', '.env.local', '.git/config', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
const maxFiles = 100;
const maxFileLines = 500;
const maxFileCharacters = 80000;

function containsProjectFile(nodes: ProjectFileNode[]): boolean {
  return nodes.some((node) => node.type === 'file' || containsProjectFile(node.children ?? []));
}

type GeneratedPayload = { summary?: string; files?: Array<{ path?: string; action?: FileChangeAction; content?: unknown }> };

function normalizeRelativePath(value: string) {
  const source = value.replaceAll('\\', '/').replace(/^\.\//, '');
  const normalized = ['.env', '.env.local'].includes(source.toLowerCase()) ? '.env.example' : source;
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) throw new Error(`不安全的文件路径：${value}`);
  if (blockedPaths.has(normalized.toLowerCase()) || normalized.startsWith('.git/')) throw new Error(`禁止修改敏感文件：${normalized}`);
  return normalized;
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

export async function generateFileChangeSet(projectId: string, agentId: string, task: string, requiredPaths: string[] = []) {
  const projects = await readJson<ProjectRecord[]>(storagePaths.projects, []);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const existingTree = await readProjectFileTree(project);
  const projectHasFiles = containsProjectFile(existingTree);
  if (agentId === 'a-frontend' && !projectHasFiles && /无人机|WebGL|Three\.js/i.test(task)) {
    const files = createDroneReactTemplate();
    return saveChangeSet({ id: `fc-${randomUUID()}`, projectId, projectName: project.name, agentRunId: 'template-react-drone', summary: 'React + Ant Design + Three.js 无人机项目基线模板', status: 'pending', files, error: '', createdAt: nowText(), appliedAt: '' });
  }
  if (agentId === 'a-frontend' && !projectHasFiles && /后台管理/i.test(task) && /登录/i.test(task) && /首页/i.test(task) && /Node/i.test(task)) {
    const files = createBasicAdminTemplate();
    return saveChangeSet({ id: `fc-${randomUUID()}`, projectId, projectName: project.name, agentRunId: 'template-basic-admin', summary: 'React + Ant Design + Node 后台管理基线模板', status: 'pending', files, error: '', createdAt: nowText(), appliedAt: '' });
  }
  const instruction = [
    task,
    '输出 JSON Schema：{"summary":"说明","files":[{"path":"相对路径","action":"create|update|delete","content":"文件完整内容"}]}。',
    '每个文件必须提供完整内容，不使用省略号。单文件不超过 500 行；页面、组件、hooks、api、types 和服务必须拆分。',
    '环境变量模板只能输出 .env.example，不得输出 .env 或 .env.local；禁止输出 Git 配置和依赖锁文件，禁止绝对路径与 .. 路径。',
  ].join('\n');
  const run = await startAgentRun({ projectId, agentId, input: instruction, structured: true });
  if (run.status !== 'success') throw new Error(run.error || '代码生成 Agent 执行失败');
  const payload = parsePayload(run.output);
  if (!Array.isArray(payload.files) || payload.files.length === 0) throw new Error('模型返回的文件变更集为空');
  if (payload.files.length > maxFiles) throw new Error(`单次最多生成 ${maxFiles} 个文件`);
  const files: FileChangeItem[] = [];
  for (const raw of payload.files) {
    const relativePath = normalizeRelativePath(String(raw.path ?? ''));
    const action = raw.action;
    if (!action || !['create', 'update', 'delete'].includes(action)) throw new Error(`文件 ${relativePath} 的操作类型无效`);
    const content = action === 'delete' ? '' : typeof raw.content === 'string' ? raw.content : JSON.stringify(raw.content ?? '', null, 2);
    if (content.length > maxFileCharacters || content.split(/\r?\n/).length > maxFileLines) throw new Error(`文件 ${relativePath} 超出单文件限制，请拆分后重新生成`);
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
