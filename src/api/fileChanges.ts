import type { FileChangeSet, PageResult } from '../types';
import { request } from './request';

export const fileChangeApi = {
  list: (projectId: string) => request<PageResult<FileChangeSet>>('/file-changes', {}, { projectId, page: 1, pageSize: 100 }),
  generate: (data: { projectId: string; agentId: string; task: string; requiredPaths?: string[] }) => request<FileChangeSet>('/file-changes/generate', { method: 'POST', body: JSON.stringify(data) }),
  apply: (id: string, paths: string[]) => request<FileChangeSet>(`/file-changes/${id}/apply`, { method: 'POST', body: JSON.stringify({ paths }) }),
  reject: (id: string) => request<FileChangeSet>(`/file-changes/${id}/reject`, { method: 'POST' }),
};
