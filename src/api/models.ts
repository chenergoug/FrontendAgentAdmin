import type { ModelRecord, PageResult } from '../types';
import { request, type QueryValue } from './request';

export const modelApi = {
  list: (query: Record<string, QueryValue>) => request<PageResult<ModelRecord>>('/models', {}, query),
  create: (data: Partial<ModelRecord>) => request<ModelRecord>('/models', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ModelRecord>) => request<ModelRecord>(`/models/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/models/${id}`, { method: 'DELETE' }),
  check: (id: string) => request<ModelRecord>(`/models/${id}/check`, { method: 'POST' }),
  exportData: (ids: string[]) => request<{ resource: string; exportedAt: string; total: number; items: ModelRecord[] }>('/models/export', {}, { ids: ids.join(',') }),
  importData: (data: unknown) => request<{ imported: number; total: number }>('/models/import', { method: 'POST', body: JSON.stringify(data) }),
};
