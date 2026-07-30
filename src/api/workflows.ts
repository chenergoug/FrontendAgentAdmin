import type { WorkflowCapabilityReport, WorkflowHistoryRecord, WorkflowSnapshot, WorkflowStageKey } from '../types';
import { request } from './request';

export const workflowApi = {
  detail: (projectId: string) => request<WorkflowSnapshot>(`/workflows/${projectId}`),
  capabilities: (projectId: string) => request<WorkflowCapabilityReport>(`/workflows/${projectId}/capabilities`),
  history: (projectId: string) => request<{ list: WorkflowHistoryRecord[] }>(`/workflows/${projectId}/history`),
  setMode: (projectId: string, autoMode: boolean) => request<WorkflowSnapshot>(`/workflows/${projectId}/mode`, { method: 'PUT', body: JSON.stringify({ autoMode }) }),
  run: (projectId: string, stageKey: WorkflowStageKey, input?: string) => request<WorkflowSnapshot>(`/workflows/${projectId}/stages/${stageKey}/run`, { method: 'POST', body: JSON.stringify({ input }) }),
  prepareRerun: (projectId: string, stageKey: WorkflowStageKey, reason: string) => request<WorkflowSnapshot>(`/workflows/${projectId}/stages/${stageKey}/rerun`, { method: 'POST', body: JSON.stringify({ reason }) }),
  saveArtifact: (projectId: string, stageKey: WorkflowStageKey, output: string) => request<WorkflowSnapshot>(`/workflows/${projectId}/stages/${stageKey}/artifact`, { method: 'PUT', body: JSON.stringify({ output }) }),
  approve: (projectId: string, stageKey: WorkflowStageKey) => request<WorkflowSnapshot>(`/workflows/${projectId}/stages/${stageKey}/approve`, { method: 'POST' }),
};
