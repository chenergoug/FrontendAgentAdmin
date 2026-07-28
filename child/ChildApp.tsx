import { AppstoreOutlined, BugOutlined } from '@ant-design/icons';
import { Card, Layout, Menu, Result, Space, Spin, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { projectApi } from '../src/api';
import type { ProjectRecord } from '../src/types';
import { API_BASE, emptyProject, menuItems, projectClientEventKey, statusColor, statusText } from './constants';
import { LockedProject } from './components/LockedProject';
import { ProjectLogsPanel } from './pages/ProjectLogsPanel';
import { TaskPanel } from './pages/TaskPanel';
import { WorkspacePanel } from './pages/WorkspacePanel';
import type { ChildMenuKey } from './types';

function getProjectId() {
  return new URLSearchParams(window.location.search).get('projectId') ?? '';
}

export function ChildApp() {
  const projectId = useMemo(getProjectId, []);
  const [activeMenu, setActiveMenu] = useState<ChildMenuKey>('workspace');
  const [project, setProject] = useState<ProjectRecord>(emptyProject);
  const [closedByHost, setClosedByHost] = useState(false);
  const [loading, setLoading] = useState(false);
  const hasProject = Boolean(project.id);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    projectApi
      .detail(projectId)
      .then((data) => {
        if (!data?.id) return;
        setProject(data);
        if (data.name) {
          document.title = `${data.name} - Frontend Agent Child Client`;
        }
      })
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!project.id || window.frontendAgent) return;

    const handleForceClosed = (event: MessageEvent) => {
      const data = event.data as { type?: string; projectId?: string } | undefined;
      if (data?.type === 'project-client-force-closed' && data.projectId === project.id) {
        setClosedByHost(true);
        window.close();
      }
    };

    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('frontend-agent-project-client');
    channel?.addEventListener('message', handleForceClosed);
    window.addEventListener('message', handleForceClosed);

    const statusTimer = window.setInterval(() => {
      projectApi
        .clientStatus(project.id)
        .then((status) => {
          if (!status.running) {
            setClosedByHost(true);
          }
        })
        .catch(() => undefined);
    }, 3000);

    const notifyClosed = () => {
      const payload = { type: 'project-client-closed', projectId: project.id };
      if (typeof BroadcastChannel !== 'undefined') {
        const notifyChannel = new BroadcastChannel('frontend-agent-project-client');
        notifyChannel.postMessage(payload);
        notifyChannel.close();
      }
      localStorage.setItem(projectClientEventKey, JSON.stringify({ ...payload, timestamp: Date.now() }));
      window.opener?.postMessage(payload, window.location.origin);
      const closeUrl = `${API_BASE}/projects/${encodeURIComponent(project.id)}/client/close`;
      navigator.sendBeacon(closeUrl, new Blob([], { type: 'text/plain' }));
      fetch(closeUrl, { method: 'POST', keepalive: true }).catch(() => undefined);
    };

    window.addEventListener('pagehide', notifyClosed);
    window.addEventListener('beforeunload', notifyClosed);
    return () => {
      window.clearInterval(statusTimer);
      channel?.removeEventListener('message', handleForceClosed);
      channel?.close();
      window.removeEventListener('message', handleForceClosed);
      window.removeEventListener('pagehide', notifyClosed);
      window.removeEventListener('beforeunload', notifyClosed);
    };
  }, [project.id]);

  const renderContent = () => {
    if (closedByHost) return <LockedProject />;
    if (!hasProject) return null;
    if (activeMenu === 'workspace') return <WorkspacePanel project={project} />;
    if (activeMenu === 'runtime') return <TaskPanel project={project} mode="runtime" />;
    if (activeMenu === 'build') return <TaskPanel project={project} mode="build" />;
    if (activeMenu === 'logs') return <ProjectLogsPanel project={project} />;

    return (
      <Card>
        <Result
          icon={<BugOutlined />}
          title="功能待接入"
          subTitle="Agent 任务和文件变更将在接入代码编辑与 Agent 执行后启用。"
        />
      </Card>
    );
  };

  if (!projectId) {
    return <Result status="warning" title="缺少项目 ID" subTitle="子客户端必须从主客户端的项目中心打开。" />;
  }

  if (!hasProject && !loading) {
    return <Result status="404" title="项目不存在" subTitle={`未找到项目：${projectId}`} />;
  }

  return (
    <Layout className="child-layout">
      <Layout.Sider className="child-sider" width={220}>
        <div className="child-brand">
          <Typography.Text className="brand-title">Project Client</Typography.Text>
          <Typography.Text className="brand-subtitle">{project.name || projectId}</Typography.Text>
        </div>
        <Menu
          items={menuItems.map((item) => ({ key: item.key, icon: item.icon, label: item.label, disabled: closedByHost }))}
          mode="inline"
          onClick={(event) => {
            if (!closedByHost) {
              setActiveMenu(event.key as ChildMenuKey);
            }
          }}
          selectedKeys={[activeMenu]}
          theme="dark"
        />
      </Layout.Sider>

      <Layout className="child-main">
        <Layout.Header className="child-header">
          <Space>
            <AppstoreOutlined />
            <Typography.Text strong>{project.name || '加载中'}</Typography.Text>
            {hasProject && <Tag color={statusColor[project.status]}>{statusText[project.status]}</Tag>}
          </Space>
          <Space>
            <Tag color="blue">只读配置</Tag>
            <Tag>第二阶段</Tag>
          </Space>
        </Layout.Header>

        <Layout.Content className="child-content">
          <Spin spinning={loading}>{renderContent()}</Spin>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
