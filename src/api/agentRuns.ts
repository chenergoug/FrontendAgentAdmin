import type { AgentRunLog, AgentRunRecord, PageResult } from '../types';
import { request, type QueryValue } from './request';

export const agentRunApi = {
  list: (query: Record<string, QueryValue>) => request<PageResult<AgentRunRecord>>('/agent-runs', {}, query),
  start: (data: { projectId: string; agentId: string; input: string }) =>
    request<AgentRunRecord>('/agent-runs', { method: 'POST', body: JSON.stringify(data) }),
  logs: (id: string) => request<{ list: AgentRunLog[] }>(`/agent-runs/${id}/logs`),
};
