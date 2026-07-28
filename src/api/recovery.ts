import type { PageResult, RecoveryRecord } from '../types';
import { request, type QueryValue } from './request';

export const recoveryApi = {
  list: (query: Record<string, QueryValue>) => request<PageResult<RecoveryRecord>>('/recovery', {}, query),
  resolve: (id: string) => request<RecoveryRecord>(`/recovery/${id}/resolve`, { method: 'POST' }),
  delete: (id: string) => request<{ ok: boolean }>(`/recovery/${id}`, { method: 'DELETE' }),
};
