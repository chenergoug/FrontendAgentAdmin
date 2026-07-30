import type { OllamaModelTag, OllamaSetupStatus, OllamaStatus } from '../types';
import { request } from './request';

export const ollamaApi = {
  status: (baseUrl?: string) => request<OllamaStatus>('/ollama/status', {}, { baseUrl }),
  models: (baseUrl?: string) => request<{ list: OllamaModelTag[] }>('/ollama/models', {}, { baseUrl }),
  setup: () => request<OllamaSetupStatus>('/ollama/setup'),
};
