/// <reference types="vite/client" />

type ProjectClientOpenResult = {
  opened: boolean;
  focused?: boolean;
  reason?: string;
};

interface Window {
  frontendAgent?: {
    openProjectClient: (projectId: string) => Promise<ProjectClientOpenResult>;
    closeProjectClient: (projectId: string) => Promise<{ closed: boolean; reason?: string }>;
    selectDirectory: () => Promise<string | null>;
    requestMainAgentConfiguration: (request: import('./types').AgentConfigurationRequest) => Promise<{ opened: boolean }>;
    onMainAgentConfigurationRequested?: (listener: (request: import('./types').AgentConfigurationRequest) => void) => () => void;
    onProjectClientChanged?: (
      listener: (event: { projectId: string; status: 'opened' | 'closed' }) => void,
    ) => () => void;
  };
}
