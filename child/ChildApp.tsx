import { BugOutlined } from '@ant-design/icons'
import { Card, Layout, Menu, Result, Spin, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { modelApi, ollamaApi, projectApi } from '../src/api'
import type { ModelRecord, OllamaStatus, ProjectRecord } from '../src/types'
import { emptyProject, menuItems } from './constants'
import { LockedProject } from './components/LockedProject'
import { AgentWorkspacePanel } from './pages/AgentWorkspacePanel'
import { FileChangesPanel } from './pages/FileChangesPanel'
import { ProjectLogsPanel } from './pages/ProjectLogsPanel'
import { TaskPanel } from './pages/TaskPanel'
import { WorkspacePanel } from './pages/WorkspacePanel'
import { WorkflowPanel } from './pages/WorkflowPanel'
import type { ChildMenuKey } from './types'

function getProjectId() {
  return new URLSearchParams(window.location.search).get('projectId') ?? ''
}

export function ChildApp() {
  const projectId = useMemo(getProjectId, [])
  const [activeMenu, setActiveMenu] = useState<ChildMenuKey>('tasks')
  const [project, setProject] = useState<ProjectRecord>(emptyProject)
  const [closedByHost, setClosedByHost] = useState(false)
  const [loading, setLoading] = useState(false)
  const [modelStatus, setModelStatus] = useState<OllamaStatus | null>(null)
  const [models, setModels] = useState<ModelRecord[]>([])
  const [modelStatusError, setModelStatusError] = useState(false)
  const hasProject = Boolean(project.id)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    projectApi
      .detail(projectId)
      .then((data) => {
        if (!data?.id) return
        setProject(data)
        if (data.name) {
          document.title = `${data.name} - Frontend Agent Child Client`
        }
      })
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    let active = true
    const loadModelStatus = () => {
      Promise.all([ollamaApi.status(), modelApi.list({ page: 1, pageSize: 100 })])
        .then(([status, modelResult]) => {
          if (!active) return
          setModelStatus(status)
          setModels(modelResult.list)
          setModelStatusError(false)
        })
        .catch(() => {
          if (!active) return
          setModelStatusError(true)
        })
    }

    loadModelStatus()
    const timer = window.setInterval(loadModelStatus, 10000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!project.id || window.frontendAgent) return

    const handleForceClosed = (event: MessageEvent) => {
      const data = event.data as { type?: string; projectId?: string } | undefined
      if (data?.type === 'project-client-force-closed' && data.projectId === project.id) {
        setClosedByHost(true)
        window.close()
      }
    }

    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('frontend-agent-project-client')
    channel?.addEventListener('message', handleForceClosed)
    window.addEventListener('message', handleForceClosed)

    const statusTimer = window.setInterval(() => {
      projectApi
        .clientStatus(project.id)
        .then((status) => {
          if (!status.running) {
            setClosedByHost(true)
          }
        })
        .catch(() => undefined)
    }, 3000)

    return () => {
      window.clearInterval(statusTimer)
      channel?.removeEventListener('message', handleForceClosed)
      channel?.close()
      window.removeEventListener('message', handleForceClosed)
    }
  }, [project.id])

  useEffect(() => {
    if (!project.id || window.frontendAgent) return
    const cancelProjectOperations = () => {
      void projectApi.closeClient(project.id, true).catch(() => undefined)
    }
    window.addEventListener('pagehide', cancelProjectOperations)
    return () => window.removeEventListener('pagehide', cancelProjectOperations)
  }, [project.id])

  const renderContent = () => {
    if (closedByHost) return <LockedProject />
    if (!hasProject) return null
    if (activeMenu === 'workspace') return <WorkspacePanel project={project} />
    if (activeMenu === 'tasks') return <AgentWorkspacePanel project={project} mode="general" />
    if (activeMenu === 'workflow') return <WorkflowPanel project={project} initialStage="requirements" onOpenChanges={() => setActiveMenu('changes')} />
    if (activeMenu === 'changes') return <FileChangesPanel project={project} />
    if (activeMenu === 'runtime') return <TaskPanel project={project} mode="runtime" onOpenChanges={() => setActiveMenu('changes')} />
    if (activeMenu === 'build') return <TaskPanel project={project} mode="build" onOpenChanges={() => setActiveMenu('changes')} />
    if (activeMenu === 'logs') return <ProjectLogsPanel project={project} />

    return (
      <Card>
        <Result
          icon={<BugOutlined />}
          title="功能待接入"
          subTitle="Agent 任务和文件变更将在接入代码编辑与 Agent 执行后启用。"
        />
      </Card>
    )
  }

  const modelName = project.modelName || '未配置'
  const selectedModel = models.find((item) => item.name === project.modelName)
  const isOllama = selectedModel?.provider.toLowerCase().includes('ollama')
  const modelAvailable = Boolean(
    selectedModel?.enabled &&
      (isOllama
        ? modelStatus?.running && modelStatus.models.some((item) => item.name === selectedModel.modelId)
        : selectedModel.healthy)
  )
  const clientRuntime = !selectedModel || (isOllama && modelStatusError)
    ? { color: 'red', text: `${modelName}模型` }
    : modelAvailable
      ? { color: 'green', text: `${modelName}模型` }
      : { color: 'gold', text: `${modelName}模型` }

  if (!projectId) {
    return <Result status="warning" title="缺少项目 ID" subTitle="子客户端必须从主客户端的项目中心打开。" />
  }

  if (!hasProject && !loading) {
    return <Result status="404" title="项目不存在" subTitle={`未找到项目：${projectId}`} />
  }

  return (
    <Layout className="child-layout">
      <Layout.Sider className="child-sider" width={220}>
        <div className="child-runtime-status">
          {hasProject && (
            <span className="child-runtime-content">
              <span className="child-runtime-indicator" style={{ backgroundColor: clientRuntime.color }} />
              <span>{clientRuntime.text}</span>
            </span>
          )}
        </div>
        <Menu
          items={menuItems.map((item) => ({
            key: item.key,
            icon: item.icon,
            label: item.label,
            disabled: closedByHost
          }))}
          mode="inline"
          onClick={(event) => {
            if (!closedByHost) {
              setActiveMenu(event.key as ChildMenuKey)
            }
          }}
          selectedKeys={[activeMenu]}
          theme="dark"
        />
      </Layout.Sider>

      <Layout className="child-main">
        <Layout.Content className="child-content">
          <Spin spinning={loading}>{renderContent()}</Spin>
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
