import type { PageResult, ProjectFileContent, ProjectFileNode, ProjectRecord, ProjectTaskLog, ProjectTaskRecord, ProjectTaskType, ProjectValidationRecord } from '../types';
import { request, type QueryValue } from './request';

type ProjectMutation = Partial<ProjectRecord> & { databasePassword?: string };

export const projectApi = {
  list: (query: Record<string, QueryValue>) => request<PageResult<ProjectRecord>>('/projects', {}, query),
  detail: (id: string) => request<ProjectRecord>(`/projects/${id}`),
  create: (data: ProjectMutation) => request<ProjectRecord>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: ProjectMutation) => request<ProjectRecord>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
  open: (id: string) => request<ProjectRecord>(`/projects/${id}/open`, { method: 'POST' }),
  close: (id: string) => request<ProjectRecord>(`/projects/${id}/close`, { method: 'POST' }),
  openClient: (id: string) => request<ProjectRecord>(`/projects/${id}/client/open`, { method: 'POST' }),
  closeClient: (id: string) => request<ProjectRecord>(`/projects/${id}/client/close`, { method: 'POST' }),
  clientStatus: (id: string) =>
    request<{ projectId: string; running: boolean; status: ProjectRecord['status']; updatedAt: string }>(`/projects/${id}/client/status`),
  fileTree: (id: string) => request<{ list: ProjectFileNode[] }>(`/projects/${id}/files/tree`),
  fileContent: (id: string, path: string) => request<ProjectFileContent>(`/projects/${id}/files/content`, {}, { path }),
  taskList: (id: string) => request<{ list: ProjectTaskRecord[] }>(`/projects/${id}/tasks`),
  startTask: (id: string, data: { type: ProjectTaskType; command?: string }) =>
    request<ProjectTaskRecord>(`/projects/${id}/tasks/start`, { method: 'POST', body: JSON.stringify(data) }),
  stopTask: (id: string, taskId: string) => request<ProjectTaskRecord>(`/projects/${id}/tasks/${taskId}/stop`, { method: 'POST' }),
  taskLogs: (id: string, taskId: string) => request<{ list: ProjectTaskLog[] }>(`/projects/${id}/tasks/${taskId}/logs`),
  validationList: (id: string) => request<{ list: ProjectValidationRecord[] }>(`/projects/${id}/validation`),
  startValidation: (id: string) => request<ProjectValidationRecord>(`/projects/${id}/validation/start`, { method: 'POST' }),
  exportData: (ids: string[]) => request<{ resource: string; exportedAt: string; total: number; items: ProjectRecord[] }>('/projects/export', {}, { ids: ids.join(',') }),
  importData: (data: unknown) => request<{ imported: number; total: number }>('/projects/import', { method: 'POST', body: JSON.stringify(data) }),
};
