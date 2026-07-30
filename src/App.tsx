import { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { AgentPage } from './pages/AgentPage';
import { HomePage } from './pages/HomePage';
import { LogsPage } from './pages/LogsPage';
import { ModelPage } from './pages/ModelPage';
import { ProjectPage } from './pages/ProjectPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { SettingsPage } from './pages/SettingsPage';
import type { AgentConfigurationRequest, MenuKey } from './types';

export function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>('home');
  const [agentRequest, setAgentRequest] = useState<AgentConfigurationRequest | null>(null);

  useEffect(() => {
    const openAgentConfiguration = (request: AgentConfigurationRequest) => {
      setActiveMenu('agents');
      setAgentRequest({ ...request, requestId: Date.now() });
    };
    const unsubscribe = window.frontendAgent?.onMainAgentConfigurationRequested?.(openAgentConfiguration);
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; request?: AgentConfigurationRequest } | undefined;
      if (payload?.type === 'frontend-agent-open-configuration' && payload.request) openAgentConfiguration(payload.request);
    };
    window.addEventListener('message', onMessage);
    return () => {
      unsubscribe?.();
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return (
    <AppShell activeMenu={activeMenu} onMenuChange={setActiveMenu}>
      {activeMenu === 'home' && <HomePage />}
      {activeMenu === 'projects' && <ProjectPage />}
      {activeMenu === 'models' && <ModelPage />}
      {activeMenu === 'agents' && <AgentPage configurationRequest={agentRequest} onConfigurationRequestHandled={() => setAgentRequest(null)} />}
      {activeMenu === 'settings' && <SettingsPage />}
      {activeMenu === 'logs' && <LogsPage />}
      {activeMenu === 'recovery' && <RecoveryPage />}
    </AppShell>
  );
}
