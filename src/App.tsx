import { useState } from 'react';
import { AppShell } from './components/AppShell';
import { AgentPage } from './pages/AgentPage';
import { HomePage } from './pages/HomePage';
import { LogsPage } from './pages/LogsPage';
import { ModelPage } from './pages/ModelPage';
import { ProjectPage } from './pages/ProjectPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { SettingsPage } from './pages/SettingsPage';
import type { MenuKey } from './types';

export function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>('home');

  return (
    <AppShell activeMenu={activeMenu} onMenuChange={setActiveMenu}>
      {activeMenu === 'home' && <HomePage />}
      {activeMenu === 'projects' && <ProjectPage />}
      {activeMenu === 'models' && <ModelPage />}
      {activeMenu === 'agents' && <AgentPage />}
      {activeMenu === 'settings' && <SettingsPage />}
      {activeMenu === 'logs' && <LogsPage />}
      {activeMenu === 'recovery' && <RecoveryPage />}
    </AppShell>
  );
}
