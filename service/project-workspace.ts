import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

export type WorkspaceStatus = {
  rootPath: string;
  resolvedPath: string;
  exists: boolean;
  isDirectory: boolean;
  canCreate: boolean;
  message: string;
};

function normalizeRootPath(rootPath: string) {
  const trimmed = rootPath.trim();
  if (!trimmed) throw new Error('项目路径不能为空');
  return path.resolve(trimmed);
}

export async function checkProjectWorkspace(rootPath: string): Promise<WorkspaceStatus> {
  const resolvedPath = normalizeRootPath(rootPath);
  try {
    const info = await stat(resolvedPath);
    const isDirectory = info.isDirectory();
    return {
      rootPath,
      resolvedPath,
      exists: true,
      isDirectory,
      canCreate: false,
      message: isDirectory ? '项目路径已存在' : '项目路径已存在但不是文件夹',
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
    return {
      rootPath,
      resolvedPath,
      exists: false,
      isDirectory: false,
      canCreate: true,
      message: '项目路径不存在，可以创建',
    };
  }
}

export async function ensureProjectWorkspace(rootPath: string): Promise<WorkspaceStatus> {
  const current = await checkProjectWorkspace(rootPath);
  if (current.exists && !current.isDirectory) {
    throw new Error('项目路径已存在但不是文件夹，请重新选择项目路径');
  }
  if (!current.exists) {
    await mkdir(current.resolvedPath, { recursive: true });
  }
  return checkProjectWorkspace(rootPath);
}

export async function assertProjectWorkspace(rootPath: string) {
  const current = await checkProjectWorkspace(rootPath);
  if (!current.exists) throw new Error('项目路径不存在，请先创建工作区目录');
  if (!current.isDirectory) throw new Error('项目路径已存在但不是文件夹，请重新选择项目路径');
  return current;
}
