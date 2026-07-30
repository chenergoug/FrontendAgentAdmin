import type { AgentPlan, AgentRecord, PageResult, TechnologyRecommendation } from '../types';
import { request, type QueryValue } from './request';

export const agentApi = {
  list: (query: Record<string, QueryValue>) => request<PageResult<AgentRecord>>('/agents', {}, query),
  detail: (id: string) => request<AgentRecord | null>(`/agents/${id}`),
  plan: (projectId: string) => request<AgentPlan>('/agents/plan', {}, { projectId }),
  regeneratePlan: (projectId: string, planning: string) => request<AgentPlan>('/agents/plan', { method: 'POST', body: JSON.stringify({ projectId, planning }) }),
  saveTechnologyRecommendations: (projectId: string, technologyRecommendations: TechnologyRecommendation[]) =>
    request<AgentPlan>('/agents/plan', { method: 'POST', body: JSON.stringify({ projectId, technologyRecommendations }) }),
  create: (data: Partial<AgentRecord>) => request<AgentRecord>('/agents', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<AgentRecord>) => request<AgentRecord>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/agents/${id}`, { method: 'DELETE' }),
  createDefaults: (modelName: string) => request<{ created: number; updated: number; total: number }>('/agents/defaults', { method: 'POST', body: JSON.stringify({ modelName }) }),
  exportData: (ids: string[]) => request<{ resource: string; exportedAt: string; total: number; items: AgentRecord[] }>('/agents/export', {}, { ids: ids.join(',') }),
  importData: (data: unknown) => request<{ imported: number; total: number }>('/agents/import', { method: 'POST', body: JSON.stringify(data) }),
};
