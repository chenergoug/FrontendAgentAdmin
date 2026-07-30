import { ExportOutlined, FolderOpenOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Descriptions,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Upload,
  message
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { modelApi, projectApi } from '../api'
import { TableToolbar } from '../components/TableToolbar'
import { PathPickerInput } from '../components/PathPickerInput'
import type { ModelRecord, PageResult, ProjectDeviceType, ProjectRecord, ProjectShape, ProjectStatus } from '../types'
import { downloadJson, exportSelectionFilename, readJsonFile, showImportError } from '../utils/transfer'
import {
  tableCardBodyStyle,
  tableCardInnerStyle,
  tableCardStyle,
  createTableScroll,
  tablePageSizeOptions,
  tablePageSizeSelectOptions,
  tablePageStyle,
  useTableScrollY,
  withIndexColumn
} from '../utils/table'
import { formatDateTimeToSecond } from '../utils/time'

type ModalMode = 'create' | 'edit' | 'detail' | null
type ProjectFormValues = ProjectRecord & { databasePassword: string }

const shapeOptions: ProjectShape[] = ['纯前端', '纯后端', '全栈 Monorepo', '前后端分离']
const deviceOptions: ProjectDeviceType[] = ['PC端', '小程序', 'Android', 'iOS', '移动端', '桌面端']
const statusText: Record<ProjectStatus, string> = {
  draft: '草稿',
  ready: '已配置',
  running: '子客户端运行中',
  locked: '配置锁定',
  error: '异常'
}
const statusColor: Record<ProjectStatus, string> = {
  draft: 'gold',
  ready: 'green',
  running: 'blue',
  locked: 'orange',
  error: 'red'
}
const projectClientEventKey = 'frontend-agent-project-client-event'

function createProject(): ProjectFormValues {
  return {
    id: '',
    name: '',
    source: '新建',
    shape: '纯前端',
    deviceType: 'PC端',
    businessType: '后台管理',
    modelName: '',
    rootPath: '',
    serverFramework: '',
    serverRootPath: 'server',
    serverDevCommand: 'npm run dev',
    serverBuildCommand: 'npm run build',
    serverTestCommand: 'npm test',
    databaseType: 'PostgreSQL',
    databaseHost: '127.0.0.1',
    databasePort: '5432',
    databaseName: '',
    databaseUsername: '',
    databasePassword: '',
    databasePasswordConfigured: false,
    gitRemote: '',
    branch: 'develop',
    serverUrl: '',
    devCommand: 'pnpm dev',
    buildCommand: 'pnpm build',
    lintCommand: 'pnpm lint',
    testCommand: 'pnpm test',
    configVersion: 1,
    status: 'draft',
    updatedAt: '',
    description: '',
    requirement: '',
    constraints: ''
  }
}

export function ProjectPage() {
  const [form] = Form.useForm<ProjectFormValues>()
  const [keyword, setKeyword] = useState('')
  const [shape, setShape] = useState<ProjectShape | undefined>()
  const [deviceType, setDeviceType] = useState<ProjectDeviceType | undefined>()
  const [status, setStatus] = useState<ProjectStatus | undefined>()
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [currentProject, setCurrentProject] = useState<ProjectRecord>(createProject())
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [data, setData] = useState<PageResult<ProjectRecord>>({ list: [], total: 0, page: 1, pageSize: 10 })
  const [models, setModels] = useState<ModelRecord[]>([])
  const { tableWrapperRef, scrollY } = useTableScrollY([data.list.length, loading, page, pageSize])
  const projectShape = Form.useWatch('shape', form)
  const childWindowsRef = useRef(new Map<string, Window>())

  const loadData = useCallback(
    (silent = false) => {
      if (!silent) {
        setLoading(true)
      }
      projectApi
        .list({ page, pageSize, keyword, shape, deviceType, status })
        .then(setData)
        .catch((error: Error) => message.error(error.message))
        .finally(() => {
          if (!silent) {
            setLoading(false)
          }
        })
    },
    [deviceType, keyword, page, pageSize, shape, status]
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    modelApi
      .list({ page: 1, pageSize: 100 })
      .then((result) => setModels(result.list.filter((item) => item.enabled)))
      .catch((error: Error) => message.error(error.message))
  }, [])

  useEffect(() => {
    const reloadProjectStatus = () => {
      loadData(true)
      window.setTimeout(() => loadData(true), 350)
    }

    const unsubscribe = window.frontendAgent?.onProjectClientChanged?.(reloadProjectStatus)
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('frontend-agent-project-client')
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; projectId?: string } | undefined
      if (data?.type === 'project-client-closed' || data?.type === 'project-client-opened') {
        reloadProjectStatus()
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === projectClientEventKey && event.newValue) {
        reloadProjectStatus()
      }
    }
    const onFocus = () => reloadProjectStatus()
    const onVisibilityChange = () => {
      if (!document.hidden) {
        reloadProjectStatus()
      }
    }

    channel?.addEventListener('message', onMessage)
    window.addEventListener('message', onMessage)
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      unsubscribe?.()
      channel?.removeEventListener('message', onMessage)
      channel?.close()
      window.removeEventListener('message', onMessage)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loadData])

  useEffect(() => {
    const timer = window.setInterval(() => {
      childWindowsRef.current.forEach((childWindow, projectId) => {
        if (!childWindow.closed) {
          return
        }

        childWindowsRef.current.delete(projectId)
        projectApi
          .closeClient(projectId)
          .then(() => loadData(true))
          .catch(() => undefined)
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [loadData])

  useEffect(() => {
    if (!data.list.some((item) => item.status === 'running')) {
      return
    }

    const timer = window.setInterval(() => loadData(true), 3000)
    return () => window.clearInterval(timer)
  }, [data.list, loadData])

  const openModal = (mode: ModalMode, project: ProjectRecord = createProject()) => {
    setCurrentProject(project)
    setModalMode(mode)
    form.setFieldsValue({ ...project, databasePassword: '' })
  }

  const closeModal = () => {
    setModalMode(null)
    form.resetFields()
  }

  const confirmProjectWorkspace = async (rootPath: string) => {
    const workspace = await projectApi.checkWorkspace(rootPath)
    if (workspace.exists && !workspace.isDirectory) {
      throw new Error('项目路径已存在但不是文件夹，请重新选择项目路径')
    }
    if (workspace.exists) return
    await new Promise<void>((resolve, reject) => {
      Modal.confirm({
        title: '项目路径不存在',
        content: `是否创建项目工作区：${workspace.resolvedPath}`,
        okText: '创建并继续',
        cancelText: '取消',
        centered: true,
        onOk: async () => {
          try {
            await projectApi.createWorkspace(rootPath)
            resolve()
          } catch (error) {
            reject(error)
          }
        },
        onCancel: () => reject(new Error('已取消创建项目工作区'))
      })
    })
  }

  const saveProject = async () => {
    const values = await form.validateFields()
    try {
      await confirmProjectWorkspace(values.rootPath)
    } catch (error) {
      message.error((error as Error).message)
      return
    }
    const reservedChildWindow =
      modalMode === 'create' && !window.frontendAgent
        ? window.open('about:blank', 'frontend-agent-child-pending')
        : null
    if (modalMode === 'create' && !window.frontendAgent && !reservedChildWindow) {
      message.error('浏览器阻止了新页面打开，请允许弹窗后重试')
      return
    }
    try {
      if (modalMode === 'create') {
        const created = await projectApi.create({
          name: values.name,
          source: '新建',
          modelName: values.modelName,
          rootPath: values.rootPath,
          description: values.description,
          requirement: values.requirement,
          constraints: values.constraints
        })
        closeModal()
        await openProjectClient(created.id, reservedChildWindow)
        loadData()
        return
      } else {
        await projectApi.update(currentProject.id, values)
      }
      message.success('项目配置已保存')
      closeModal()
      loadData()
    } catch (error) {
      reservedChildWindow?.close()
      message.error((error as Error).message)
    }
  }

  const reset = () => {
    setKeyword('')
    setShape(undefined)
    setDeviceType(undefined)
    setStatus(undefined)
    setPage(1)
  }

  const runAction = async (action: () => Promise<unknown>, successText: string) => {
    try {
      await action()
      message.success(successText)
      loadData()
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const openProjectClient = (projectId: string, reservedChildWindow?: Window | null) =>
    runAction(async () => {
      if (window.frontendAgent?.openProjectClient) {
        await projectApi.openClient(projectId)
        try {
          await window.frontendAgent.openProjectClient(projectId)
        } catch (error) {
          await projectApi.closeClient(projectId).catch(() => undefined)
          throw error
        }
        return
      }

      const childWindow = reservedChildWindow ?? window.open('about:blank', `frontend-agent-child-${projectId}`)
      if (!childWindow) {
        throw new Error('浏览器阻止了新页面打开，请允许弹窗后重试')
      }

      try {
        await projectApi.openClient(projectId)
        childWindowsRef.current.set(projectId, childWindow)
        childWindow.location.href = `${window.location.origin}/child.html?projectId=${encodeURIComponent(projectId)}`
        childWindow.focus()
      } catch (error) {
        childWindow.close()
        throw error
      }
    }, '子客户端已打开')

  const closeProjectClient = (projectId: string) =>
    runAction(async () => {
      if (window.frontendAgent?.closeProjectClient) {
        await window.frontendAgent.closeProjectClient(projectId)
        return
      }
      const payload = { type: 'project-client-force-closed', projectId }
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('frontend-agent-project-client')
        channel.postMessage(payload)
        channel.close()
      }
      localStorage.setItem(projectClientEventKey, JSON.stringify({ ...payload, timestamp: Date.now() }))
      const childWindow = childWindowsRef.current.get(projectId)
      childWindow?.postMessage(payload, window.location.origin)
      childWindow?.close()
      childWindowsRef.current.delete(projectId)
      await projectApi.closeClient(projectId)
    }, '子客户端已关闭')

  const importProjects = async (file: File) => {
    try {
      const data = await readJsonFile(file)
      const result = await projectApi.importData(data)
      message.success(`成功导入 ${result.imported} 条项目配置`)
      setSelectedRowKeys([])
      loadData()
    } catch (error) {
      showImportError(error)
    }
  }

  const exportProjects = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择需要导出的项目')
      return
    }
    try {
      const selectedIds = selectedRowKeys.map(String)
      const selectedIdSet = new Set(selectedIds)
      const exportResult = await projectApi.exportData(selectedIds)
      const items = exportResult.items.filter((item) => selectedIdSet.has(item.id))
      if (items.length !== selectedIds.length) {
        message.error('导出数据和选中数据不一致，请刷新列表后重试')
        return
      }
      const selectedItems = selectedIds
        .map((id) => data.list.find((item) => item.id === id) ?? items.find((item) => item.id === id))
        .filter(Boolean) as ProjectRecord[]
      downloadJson(exportSelectionFilename(selectedItems, '项目集合'), { ...exportResult, total: items.length, items })
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const columns: ColumnsType<ProjectRecord> = withIndexColumn<ProjectRecord>(
    [
      {
        title: '项目名称',
        dataIndex: 'name',
        width: 180,
        fixed: 'start',
        render: (_, record) => (
          <Button type="link" onClick={() => openModal('detail', record)}>
            {record.name}
          </Button>
        )
      },
      { title: '项目形态', dataIndex: 'shape', width: 140, render: (value: string, item) => item.status === 'draft' ? '待 Agent 分析' : value },
      { title: '运行平台', dataIndex: 'deviceType', width: 120, render: (value: string, item) => item.status === 'draft' ? '待 Agent 分析' : value },
      { title: '业务类型', dataIndex: 'businessType', width: 220, ellipsis: true, render: (value: string, item) => item.status === 'draft' ? '待 Agent 分析' : value || '-' },
      { title: '项目模型', dataIndex: 'modelName', width: 180, ellipsis: true, render: (value: string) => value || '未配置' },
      {
        title: 'Git 地址',
        dataIndex: 'gitRemote',
        width: 260,
        ellipsis: true,
        render: (value: string) => value || '-'
      },
      { title: '默认分支', dataIndex: 'branch', width: 110 },
      {
        title: '服务器地址',
        dataIndex: 'serverUrl',
        width: 240,
        ellipsis: true,
        render: (value: string) => value || '-'
      },
      { title: '配置版本', dataIndex: 'configVersion', width: 100, render: (value: number) => `v${value}` },
      {
        title: '状态',
        dataIndex: 'status',
        width: 140,
        render: (value: ProjectStatus) => <Tag color={statusColor[value]}>{statusText[value]}</Tag>
      },
      { title: '更新时间', dataIndex: 'updatedAt', width: 180, render: formatDateTimeToSecond },
      {
        title: '操作',
        key: 'action',
        width: 230,
        fixed: 'end',
        render: (_, record) => (
          <Space>
            <Button type="link" onClick={() => openModal('detail', record)}>
              详情
            </Button>
            <Button type="link" disabled={record.status === 'running'} onClick={() => openModal('edit', record)}>
              编辑
            </Button>
            {record.status === 'running' ? (
              <Button danger type="link" onClick={() => closeProjectClient(record.id)}>
                关闭
              </Button>
            ) : (
              <Button type="link" onClick={() => openProjectClient(record.id)}>
                打开
              </Button>
            )}
            <Popconfirm
              title="确认删除项目？"
              description={`将从列表移除「${record.name}」，不会删除本地项目文件。`}
              okText="确认"
              cancelText="取消"
              disabled={record.status === 'running'}
              onConfirm={() => runAction(() => projectApi.delete(record.id), '项目已删除')}>
              <Button danger disabled={record.status === 'running'} type="link">
                删除
              </Button>
            </Popconfirm>
          </Space>
        )
      }
    ],
    page,
    pageSize
  )

  const readonly = modalMode === 'detail' || currentProject.status === 'running'
  const shapeSelectOptions = useMemo(() => shapeOptions.map((item) => ({ label: item, value: item })), [])
  const deviceSelectOptions = useMemo(() => deviceOptions.map((item) => ({ label: item, value: item })), [])

  return (
    <Flex vertical gap={16} style={tablePageStyle}>
      <TableToolbar
        keyword={keyword}
        onKeywordChange={(value) => {
          setKeyword(value)
          setPage(1)
        }}
        onReset={reset}
        onSearch={() => setPage(1)}>
        <Select
          allowClear
          placeholder="项目形态"
          value={shape}
          onChange={(value) => {
            setShape(value)
            setPage(1)
          }}
          style={{ width: 160 }}
          options={shapeSelectOptions}
        />
        <Select
          allowClear
          placeholder="项目类型"
          value={deviceType}
          onChange={(value) => {
            setDeviceType(value)
            setPage(1)
          }}
          style={{ width: 140 }}
          options={deviceSelectOptions}
        />
        <Select
          allowClear
          placeholder="状态"
          value={status}
          onChange={(value) => {
            setStatus(value)
            setPage(1)
          }}
          style={{ width: 150 }}
          options={Object.entries(statusText).map(([value, label]) => ({ label, value }))}
        />
      </TableToolbar>
      <Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal('create')}>
          新建项目
        </Button>
        <Upload
          accept=".json"
          showUploadList={false}
          beforeUpload={(file) => {
            void importProjects(file)
            return Upload.LIST_IGNORE
          }}>
          <Button icon={<FolderOpenOutlined />}>导入项目</Button>
        </Upload>
        <Button icon={<ExportOutlined />} onClick={exportProjects}>
          导出项目
        </Button>
      </Space>
      <div ref={tableWrapperRef} style={tableCardStyle}>
        <Card style={tableCardInnerStyle} styles={{ body: tableCardBodyStyle }}>
          <Table
            columns={columns}
            dataSource={data.list}
            loading={loading}
            pagination={{
              current: page,
              pageSize,
              total: data.total,
              showSizeChanger: { options: tablePageSizeSelectOptions },
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条记录`,
              pageSizeOptions: tablePageSizeOptions
            }}
            rowKey="id"
            rowSelection={{
              preserveSelectedRowKeys: true,
              selectedRowKeys,
              onChange: setSelectedRowKeys
            }}
            scroll={createTableScroll(scrollY)}
            onChange={(pagination) => {
              setPage(pagination.current ?? 1)
              setPageSize(pagination.pageSize ?? 10)
            }}
          />
        </Card>
      </div>
      <Modal
        title={modalMode === 'create' ? '新建项目' : modalMode === 'edit' ? '编辑项目' : '项目详情'}
        open={modalMode !== null}
        onCancel={closeModal}
        onOk={saveProject}
        okText="保存"
        cancelText={modalMode === 'detail' ? '关闭' : '取消'}
        footer={modalMode === 'detail' ? (_, { CancelBtn }) => <CancelBtn /> : undefined}
        width={980}>
        {modalMode === 'detail' ? (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="项目名称">{currentProject.name}</Descriptions.Item>
            <Descriptions.Item label="项目形态">{currentProject.status === 'draft' ? '待 Agent 分析' : currentProject.shape}</Descriptions.Item>
            <Descriptions.Item label="运行平台">{currentProject.status === 'draft' ? '待 Agent 分析' : currentProject.deviceType}</Descriptions.Item>
            <Descriptions.Item label="业务类型">{currentProject.status === 'draft' ? '待 Agent 分析' : currentProject.businessType}</Descriptions.Item>
            <Descriptions.Item label="项目模型">{currentProject.modelName || '未配置'}</Descriptions.Item>
            <Descriptions.Item label="项目路径" span={2}>
              {currentProject.rootPath}
            </Descriptions.Item>
            {currentProject.shape !== '纯前端' && (
              <>
                <Descriptions.Item label="服务端技术栈">{currentProject.serverFramework || '-'}</Descriptions.Item>
                <Descriptions.Item label="服务端目录">{currentProject.serverRootPath || '-'}</Descriptions.Item>
                <Descriptions.Item label="服务端运行命令" span={2}>
                  {currentProject.serverDevCommand || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="服务端构建命令">{currentProject.serverBuildCommand || '-'}</Descriptions.Item>
                <Descriptions.Item label="服务端测试命令">{currentProject.serverTestCommand || '-'}</Descriptions.Item>
                <Descriptions.Item label="服务器地址" span={2}>
                  {currentProject.serverUrl || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="数据库类型">{currentProject.databaseType || '-'}</Descriptions.Item>
                <Descriptions.Item label="数据库地址">
                  {currentProject.databaseHost || '-'}:{currentProject.databasePort || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="数据库名称">{currentProject.databaseName || '-'}</Descriptions.Item>
                <Descriptions.Item label="数据库账号">{currentProject.databaseUsername || '-'}</Descriptions.Item>
                <Descriptions.Item label="数据库密码">
                  {currentProject.databasePasswordConfigured ? '已安全配置' : '未配置'}
                </Descriptions.Item>
              </>
            )}
            <Descriptions.Item label="Git 地址" span={2}>
              {currentProject.gitRemote || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="项目介绍" span={2}>
              {currentProject.description}
            </Descriptions.Item>
            <Descriptions.Item label="原始需求" span={2}>
              {currentProject.requirement}
            </Descriptions.Item>
            <Descriptions.Item label="硬性约束" span={2}>
              {currentProject.constraints || '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : modalMode === 'create' ? (
          <Form form={form} layout="vertical" className="grid-form">
            <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="modelName" label="项目模型" rules={[{ required: true, message: '请选择项目使用的模型' }]}>
              <Select
                showSearch
                placeholder="选择子客户端分析与开发使用的模型"
                optionFilterProp="label"
                options={models.map((item) => ({
                  label: `${item.name} / ${item.provider} / ${item.modelId}`,
                  value: item.name
                }))}
              />
            </Form.Item>
            <Form.Item name="rootPath" label="项目路径" rules={[{ required: true, message: '请选择或输入项目路径' }]}>
              <PathPickerInput placeholder="请选择或创建项目文件夹" />
            </Form.Item>
            <Form.Item name="description" label="项目介绍" className="wide-form-item">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item
              name="requirement"
              label="原始需求"
              className="wide-form-item"
              rules={[{ required: true, message: '请描述需要实现的产品和功能' }]}>
              <Input.TextArea rows={6} />
            </Form.Item>
            <Form.Item name="constraints" label="硬性约束" className="wide-form-item">
              <Input.TextArea rows={3} placeholder="例如必须支持 Windows、禁止使用云数据库、需要兼容指定浏览器" />
            </Form.Item>
          </Form>
        ) : (
          <Form form={form} layout="vertical" disabled={readonly} className="grid-form">
            <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="shape" label="项目形态" rules={[{ required: true }]}>
              <Select options={shapeSelectOptions} />
            </Form.Item>
            <Form.Item name="deviceType" label="项目类型" rules={[{ required: true }]}>
              <Select options={deviceSelectOptions} />
            </Form.Item>
            <Form.Item name="businessType" label="业务类型">
              <Input />
            </Form.Item>
            <Form.Item name="modelName" label="项目模型" rules={[{ required: true, message: '请选择项目使用的模型' }]}>
              <Select
                showSearch
                placeholder="选择子客户端执行任务时使用的模型"
                optionFilterProp="label"
                options={models.map((item) => ({
                  label: `${item.name} / ${item.provider} / ${item.modelId}`,
                  value: item.name
                }))}
              />
            </Form.Item>
            <Form.Item name="rootPath" label="项目路径" rules={[{ required: true, message: '请选择或输入项目路径' }]}>
              <PathPickerInput placeholder="请选择或输入具体项目文件夹" />
            </Form.Item>
            {projectShape !== '纯前端' && (
              <>
                <Form.Item
                  name="serverFramework"
                  label="服务端技术栈"
                  rules={[{ required: true, message: '请选择服务端技术栈' }]}>
                  <Select
                    options={['Node.js + TypeScript', 'NestJS', 'Express', 'Fastify', 'Koa', 'Next.js API', '其他'].map(
                      (item) => ({ label: item, value: item })
                    )}
                  />
                </Form.Item>
                <Form.Item
                  name="serverRootPath"
                  label="服务端目录"
                  rules={[{ required: true, message: '请输入服务端目录' }]}>
                  <Input placeholder="例如 server 或 apps/server" />
                </Form.Item>
                <Form.Item
                  name="serverDevCommand"
                  label="服务端运行命令"
                  rules={[{ required: true, message: '请输入服务端运行命令' }]}>
                  <Input placeholder="例如 npm run dev" />
                </Form.Item>
                <Form.Item
                  name="serverBuildCommand"
                  label="服务端构建命令"
                  rules={[{ required: true, message: '请输入服务端构建命令' }]}>
                  <Input placeholder="例如 npm run build" />
                </Form.Item>
                <Form.Item
                  name="serverTestCommand"
                  label="服务端测试命令"
                  rules={[{ required: true, message: '请输入服务端测试命令' }]}>
                  <Input placeholder="例如 npm test" />
                </Form.Item>
                <Form.Item
                  name="serverUrl"
                  label="服务器地址"
                  rules={[
                    { required: true, message: '请输入服务器地址' },
                    { type: 'url', message: '请输入有效的 HTTP/HTTPS 地址' }
                  ]}>
                  <Input placeholder="例如 https://api.example.com" />
                </Form.Item>
                <Form.Item
                  name="databaseType"
                  label="数据库类型"
                  rules={[{ required: true, message: '请选择数据库类型' }]}>
                  <Select
                    options={[
                      'PostgreSQL',
                      'MySQL',
                      'MariaDB',
                      'SQL Server',
                      'Oracle',
                      'MongoDB',
                      'SQLite',
                      'Redis',
                      '其他'
                    ].map((item) => ({ label: item, value: item }))}
                    onChange={(value) => {
                      const ports: Record<string, string> = {
                        PostgreSQL: '5432',
                        MySQL: '3306',
                        MariaDB: '3306',
                        'SQL Server': '1433',
                        Oracle: '1521',
                        MongoDB: '27017',
                        Redis: '6379'
                      }
                      if (ports[value]) form.setFieldValue('databasePort', ports[value])
                    }}
                  />
                </Form.Item>
                <Form.Item
                  name="databaseHost"
                  label="数据库主机"
                  rules={[{ required: true, message: '请输入数据库主机' }]}>
                  <Input placeholder="域名、IP 或 127.0.0.1" />
                </Form.Item>
                <Form.Item
                  name="databasePort"
                  label="数据库端口"
                  rules={[
                    { required: true, message: '请输入数据库端口' },
                    { pattern: /^\d{1,5}$/, message: '请输入有效端口' }
                  ]}>
                  <Input placeholder="5432" />
                </Form.Item>
                <Form.Item
                  name="databaseName"
                  label="数据库名称"
                  rules={[{ required: true, message: '请输入数据库名称' }]}>
                  <Input />
                </Form.Item>
                <Form.Item
                  name="databaseUsername"
                  label="数据库账号"
                  rules={[{ required: true, message: '请输入数据库账号' }]}>
                  <Input autoComplete="off" />
                </Form.Item>
                <Form.Item
                  name="databasePassword"
                  label="数据库密码"
                  rules={[
                    {
                      required: !currentProject.databasePasswordConfigured,
                      message: '请输入数据库密码'
                    }
                  ]}
                  extra={currentProject.databasePasswordConfigured ? '密码已配置，留空表示不修改' : undefined}>
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
              </>
            )}
            <Form.Item name="gitRemote" label="Git 地址">
              <Input />
            </Form.Item>
            <Form.Item name="branch" label="默认分支">
              <Input />
            </Form.Item>
            <Form.Item name="devCommand" label="运行命令">
              <Input />
            </Form.Item>
            <Form.Item name="buildCommand" label="构建命令">
              <Input />
            </Form.Item>
            <Form.Item name="lintCommand" label="Lint 命令">
              <Input />
            </Form.Item>
            <Form.Item name="testCommand" label="测试命令">
              <Input />
            </Form.Item>
            <Form.Item name="description" label="项目介绍" className="wide-form-item">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item name="requirement" label="原始需求" className="wide-form-item">
              <Input.TextArea rows={4} />
            </Form.Item>
            <Form.Item name="constraints" label="硬性约束" className="wide-form-item">
              <Input.TextArea rows={3} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Flex>
  )
}
