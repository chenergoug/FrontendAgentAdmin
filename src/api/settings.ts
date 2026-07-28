import type { PageResult, SettingRecord } from '../types';
import { request, type QueryValue } from './request';

export const settingApi = {
  list: (query: Record<string, QueryValue>) => request<PageResult<SettingRecord>>('/settings', {}, query),
  update: (id: string, data: Partial<SettingRecord>) => request<SettingRecord>(`/settings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};
