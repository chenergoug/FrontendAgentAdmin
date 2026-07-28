import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { nowText } from './config.js';
import type { ProjectFileContent, ProjectFileNode, ProjectRecord } from './types.js';

const ignoredNames = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'dist-service', 'release', '.next', '.nuxt', 'build', 'coverage']);
const maxDepth = 4;
const maxEntriesPerDirectory = 200;
const maxFileSize = 1024 * 1024;

function formatStatTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function assertProjectRoot(project: ProjectRecord) {
  if (!project.rootPath) {
    throw new Error('项目路径未配置');
  }
  return path.resolve(project.rootPath);
}

function resolveProjectPath(project: ProjectRecord, relativePath = '') {
  const root = assertProjectRoot(project);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('文件路径越权，已阻止访问');
  }
  return { root, target, relative: relative.replaceAll(path.sep, '/') };
}

function detectLanguage(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.vue': 'vue',
    '.json': 'json',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.md': 'markdown',
    '.dart': 'dart',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.yml': 'yaml',
    '.yaml': 'yaml',
  };
  return map[extension] ?? 'text';
}

async function buildTreeNode(root: string, absolutePath: string, depth: number): Promise<ProjectFileNode | null> {
  const name = path.basename(absolutePath);
  if (ignoredNames.has(name)) {
    return null;
  }

  const stat = await lstat(absolutePath);
  const relative = path.relative(root, absolutePath).replaceAll(path.sep, '/');
  const node: ProjectFileNode = {
    name,
    path: relative,
    type: stat.isDirectory() ? 'directory' : 'file',
    size: stat.size,
    updatedAt: formatStatTime(stat.mtime),
  };

  if (stat.isDirectory() && depth < maxDepth) {
    const entries = (await readdir(absolutePath)).slice(0, maxEntriesPerDirectory);
    const children = await Promise.all(entries.map((entry) => buildTreeNode(root, path.join(absolutePath, entry), depth + 1)));
    node.children = children.filter(Boolean).sort((a, b) => {
      if (!a || !b) return 0;
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    }) as ProjectFileNode[];
  }

  return node;
}

export async function readProjectFileTree(project: ProjectRecord) {
  const root = assertProjectRoot(project);
  try {
    const stat = await lstat(root);
    if (!stat.isDirectory()) {
      throw new Error('项目路径不是文件夹');
    }
    const node = await buildTreeNode(root, root, 0);
    return node ? [node] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function readProjectFileContent(project: ProjectRecord, filePath: string): Promise<ProjectFileContent> {
  const { target, relative } = resolveProjectPath(project, filePath);
  const stat = await lstat(target);
  if (!stat.isFile()) {
    throw new Error('只能读取文件内容');
  }
  if (stat.size > maxFileSize) {
    throw new Error('文件超过 1MB，暂不支持预览');
  }

  return {
    path: relative,
    name: path.basename(target),
    size: stat.size,
    updatedAt: formatStatTime(stat.mtime),
    language: detectLanguage(target),
    content: await readFile(target, 'utf8'),
  };
}

export { nowText };
