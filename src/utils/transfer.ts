import { message } from 'antd';

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function safeJsonFilename(name: string) {
  const safeName = name.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ');
  return `${safeName || '导出数据'}.json`;
}

export function exportSelectionFilename(items: Array<{ name?: string }>, collectionName: string) {
  if (items.length === 1) {
    return safeJsonFilename(items[0].name || collectionName);
  }
  return safeJsonFilename(collectionName);
}

export async function readJsonFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.json')) {
    throw new Error('只能导入 JSON 文件');
  }
  const text = await file.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('JSON 文件格式不正确');
  }
}

export function showImportError(error: unknown) {
  const err = error as Error & { errors?: string[] };
  const details = Array.isArray(err.errors) ? `：${err.errors.slice(0, 3).join('；')}` : '';
  message.error(`${err.message || '导入失败'}${details}`);
}
