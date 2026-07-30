import { ExportOutlined, ImportOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Alert,
  Card,
  Descriptions,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  message
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { modelApi, ollamaApi } from '../api'
import { TableToolbar } from '../components/TableToolbar'
import type { ModelRecord, OllamaModelTag, OllamaSetupStatus, PageResult } from '../types'
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

const modelTypes: ModelRecord['type'][] = ['线上模型', '本地离线模型']

function createModel(): ModelRecord {
  return {
    id: '',
    name: '',
    type: '线上模型',
    provider: 'OpenAI',
    baseUrl: '',
    modelId: '',
    contextWindow: 32768,
    maxOutput: 4096,
    timeout: 120,
    enabled: true,
    healthy: false,
    checkedAt: '未检查'
  }
}

export function ModelPage() {
  const [form] = Form.useForm<ModelRecord>()
  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState<ModelRecord['type'] | undefined>()
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [current, setCurrent] = useState<ModelRecord>(createModel())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [loading, setLoading] = useState(false)
  const [scanningLocalModels, setScanningLocalModels] = useState(false)
  const [localScanComplete, setLocalScanComplete] = useState(false)
  const [data, setData] = useState<PageResult<ModelRecord>>({ list: [], total: 0, page: 1, pageSize: 10 })
  const [ollamaModels, setOllamaModels] = useState<OllamaModelTag[]>([])
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupStatus, setSetupStatus] = useState<OllamaSetupStatus | null>(null)
  const [checkingSetup, setCheckingSetup] = useState(false)
  const provider = Form.useWatch('provider', form)
  const modelType = Form.useWatch('type', form)
  const { tableWrapperRef, scrollY } = useTableScrollY([data.list.length, loading, page, pageSize])

  const loadData = useCallback(() => {
    setLoading(true)
    modelApi
      .list({ page, pageSize, keyword, type })
      .then(setData)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false))
  }, [keyword, page, pageSize, type])

  useEffect(() => {
    loadData()
  }, [loadData])

  const scanLocalModels = async (showResult = true) => {
    setScanningLocalModels(true)
    setLocalScanComplete(false)
    try {
      const baseUrl = form.getFieldValue('baseUrl') || 'http://127.0.0.1:11434'
      const status = await ollamaApi.status(baseUrl)
      setOllamaModels(status.models)
      setLocalScanComplete(status.running)
      if (!status.running) throw new Error('未检测到正在运行的 Ollama 服务')
      if (status.models.length === 0) throw new Error('Ollama 已运行，但尚未安装任何模型')
      if (showResult) message.success(`已扫描到 ${status.models.length} 个本地模型`)
      return status.models
    } catch (error) {
      setOllamaModels([])
      if (showResult) message.error((error as Error).message)
      return []
    } finally {
      setScanningLocalModels(false)
    }
  }

  const open = (mode: ModalMode, model = createModel()) => {
    setCurrent(model)
    setModalMode(mode)
    form.setFieldsValue(model)
    if (model.type === '本地离线模型') void scanLocalModels(false)
  }

  const save = async () => {
    const values = await form.validateFields()
    try {
      if (values.type === '本地离线模型') {
        const installedModels = await scanLocalModels(false)
        if (!installedModels.some((item) => item.name === values.modelId)) {
          throw new Error(`本地未安装模型：${values.modelId || '-'}`)
        }
      }
      if (modalMode === 'create') {
        await modelApi.create(values)
      } else {
        await modelApi.update(current.id, values)
      }
      message.success('模型配置已保存')
      setModalMode(null)
      loadData()
    } catch (error) {
      message.error((error as Error).message)
    }
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

  const inspectAndSyncOllama = async () => {
    setCheckingSetup(true)
    try {
      const status = await ollamaApi.setup()
      setSetupStatus(status)
      if (status.installed && status.running && status.modelInstalled) {
        const result = await modelApi.syncOllamaDefault()
        message.success(`已同步 ${result.total} 个 Ollama 模型，新增 ${result.added} 个，更新 ${result.updated} 个`)
        setSetupOpen(false)
        loadData()
        return
      }
      setSetupOpen(true)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setCheckingSetup(false)
    }
  }

  const importModels = async (file: File) => {
    try {
      const data = await readJsonFile(file)
      const result = await modelApi.importData(data)
      message.success(`成功导入 ${result.imported} 条模型配置`)
      setSelectedRowKeys([])
      loadData()
    } catch (error) {
      showImportError(error)
    }
  }

  const exportModels = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择需要导出的模型')
      return
    }
    try {
      const selectedIds = selectedRowKeys.map(String)
      const selectedIdSet = new Set(selectedIds)
      const exportResult = await modelApi.exportData(selectedIds)
      const items = exportResult.items.filter((item) => selectedIdSet.has(item.id))
      if (items.length !== selectedIds.length) {
        message.error('导出数据和选中数据不一致，请刷新列表后重试')
        return
      }
      const selectedItems = selectedIds
        .map((id) => data.list.find((item) => item.id === id) ?? items.find((item) => item.id === id))
        .filter(Boolean) as ModelRecord[]
      downloadJson(exportSelectionFilename(selectedItems, '模型集合'), { ...exportResult, total: items.length, items })
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const columns: ColumnsType<ModelRecord> = withIndexColumn<ModelRecord>(
    [
      {
        title: '模型名称',
        dataIndex: 'name',
        width: 180,
        fixed: 'start',
        render: (_, item) => (
          <Button type="link" onClick={() => open('detail', item)}>
            {item.name}
          </Button>
        )
      },
      { title: '模型类型', dataIndex: 'type', width: 130 },
      { title: '服务商', dataIndex: 'provider', width: 120 },
      { title: '服务地址', dataIndex: 'baseUrl', width: 260, ellipsis: true },
      { title: 'Model ID', dataIndex: 'modelId', width: 180 },
      { title: '上下文长度', dataIndex: 'contextWindow', width: 120 },
      { title: '最大输出', dataIndex: 'maxOutput', width: 110 },
      { title: '超时(s)', dataIndex: 'timeout', width: 90 },
      {
        title: '启用',
        dataIndex: 'enabled',
        width: 90,
        render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>
      },
      {
        title: '健康状态',
        dataIndex: 'healthy',
        width: 110,
        render: (value: boolean) => <Tag color={value ? 'green' : 'red'}>{value ? '健康' : '异常'}</Tag>
      },
      { title: '最近检查', dataIndex: 'checkedAt', width: 180, render: formatDateTimeToSecond },
      {
        title: '操作',
        width: 190,
        fixed: 'end',
        render: (_, item) => (
          <Space>
            <Button type="link" onClick={() => open('detail', item)}>
              查看
            </Button>
            <Button type="link" onClick={() => open('edit', item)}>
              编辑
            </Button>
            <Button type="link" onClick={() => runAction(() => modelApi.check(item.id), '模型检查完成')}>
              检查
            </Button>
            <Popconfirm
              title="确认删除模型？"
              description={`删除「${item.name}」后 Agent 将不能继续引用该模型。`}
              onConfirm={() => runAction(() => modelApi.delete(item.id), '模型已删除')}
              okText="确认"
              cancelText="取消">
              <Button danger type="link">
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

  return (
    <Flex vertical gap={16} style={tablePageStyle}>
      <TableToolbar
        keyword={keyword}
        onKeywordChange={(value) => {
          setKeyword(value)
          setPage(1)
        }}
        onReset={() => {
          setKeyword('')
          setType(undefined)
          setPage(1)
        }}>
        <Select
          allowClear
          placeholder="模型类型"
          value={type}
          onChange={(value) => {
            setType(value)
            setPage(1)
          }}
          style={{ width: 150 }}
          options={modelTypes.map((item) => ({ label: item, value: item }))}
        />
      </TableToolbar>
      <Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('create')}>
          新增模型
        </Button>
        <Upload
          accept=".json"
          showUploadList={false}
          beforeUpload={(file) => {
            void importModels(file)
            return Upload.LIST_IGNORE
          }}>
          <Button icon={<ImportOutlined />}>导入模型</Button>
        </Upload>
        <Button icon={<ExportOutlined />} onClick={exportModels}>
          导出模型
        </Button>
        <Button loading={checkingSetup} onClick={() => void inspectAndSyncOllama()}>
          扫描并添加 Ollama 模型
        </Button>
        <Button
          onClick={() =>
            Promise.all(data.list.map((item) => modelApi.check(item.id)))
              .then(() => {
                message.success('当前页模型检查完成')
                loadData()
              })
              .catch((error: Error) => message.error(error.message))
          }>
          当前页健康检查
        </Button>
      </Space>
      <div ref={tableWrapperRef} style={tableCardStyle}>
        <Card style={tableCardInnerStyle} styles={{ body: tableCardBodyStyle }}>
          <Table
            columns={columns}
            dataSource={data.list}
            loading={loading}
            rowKey="id"
            rowSelection={{
              preserveSelectedRowKeys: true,
              selectedRowKeys,
              onChange: setSelectedRowKeys
            }}
            scroll={createTableScroll(scrollY)}
            pagination={{
              current: page,
              pageSize,
              total: data.total,
              showSizeChanger: { options: tablePageSizeSelectOptions },
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条记录`,
              pageSizeOptions: tablePageSizeOptions
            }}
            onChange={(pagination) => {
              setPage(pagination.current ?? 1)
              setPageSize(pagination.pageSize ?? 10)
            }}
          />
        </Card>
      </div>
      <Modal
        title="Ollama 本地模型配置教程"
        open={setupOpen}
        centered
        onCancel={() => setSetupOpen(false)}
        width={720}
        footer={[
          <Button key="close" onClick={() => setSetupOpen(false)}>
            关闭
          </Button>,
          <Button
            key="scan"
            type="primary"
            loading={checkingSetup}
            onClick={() => void inspectAndSyncOllama()}>
            重新扫描并添加
          </Button>
        ]}>
        <Alert
          showIcon
          type="warning"
          message="本地运行环境不完整"
          description="平台只负责扫描和添加模型配置。请在系统终端中完成以下步骤，安装结束后点击“重新扫描并添加”。"
        />
        <Descriptions bordered size="small" column={1} style={{ marginTop: 16 }}>
          <Descriptions.Item label="操作系统">{setupStatus?.platform || '-'}</Descriptions.Item>
          <Descriptions.Item label="Ollama 程序">
            <Tag color={setupStatus?.installed ? 'green' : 'red'}>{setupStatus?.installed ? '已安装' : '未安装'}</Tag>
            {setupStatus?.version || ''}
          </Descriptions.Item>
          <Descriptions.Item label="Ollama 服务">
            <Tag color={setupStatus?.running ? 'green' : 'orange'}>{setupStatus?.running ? '运行中' : '未运行'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="默认模型">
            <Tag color={setupStatus?.modelInstalled ? 'green' : setupStatus?.running ? 'red' : 'orange'}>
              {setupStatus?.modelInstalled ? '已安装' : setupStatus?.running ? '未安装' : '待服务启动后检测'}
            </Tag>
            {setupStatus?.modelId || 'qwen2.5-coder:7b'}
          </Descriptions.Item>
        </Descriptions>
        <Typography.Title level={5} style={{ marginTop: 20 }}>安装步骤</Typography.Title>
        {setupStatus?.platform === 'darwin' ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text>1. 安装 Ollama</Typography.Text>
            <Typography.Paragraph code copyable>brew install --cask ollama</Typography.Paragraph>
            <Typography.Text>2. 启动 Ollama</Typography.Text>
            <Typography.Paragraph code copyable>open -a Ollama</Typography.Paragraph>
            <Typography.Text>3. 下载默认模型</Typography.Text>
            <Typography.Paragraph code copyable>ollama pull qwen2.5-coder:7b</Typography.Paragraph>
          </Space>
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text>1. 使用 PowerShell 安装 Ollama</Typography.Text>
            <Typography.Paragraph code copyable>winget install --id Ollama.Ollama -e</Typography.Paragraph>
            <Typography.Text>2. 从开始菜单启动 Ollama，或在 PowerShell 启动服务</Typography.Text>
            <Typography.Paragraph code copyable>ollama serve</Typography.Paragraph>
            <Typography.Text>3. 新开一个 PowerShell 窗口下载默认模型</Typography.Text>
            <Typography.Paragraph code copyable>ollama pull qwen2.5-coder:7b</Typography.Paragraph>
          </Space>
        )}
      </Modal>
      <Modal
        title={modalMode === 'create' ? '新增模型' : modalMode === 'edit' ? '编辑模型' : '模型详情'}
        open={modalMode !== null}
        onCancel={() => setModalMode(null)}
        onOk={save}
        footer={modalMode === 'detail' ? (_, { CancelBtn }) => <CancelBtn /> : undefined}
        width={760}
        okText="保存"
        cancelText="取消">
        {modalMode === 'detail' ? (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="模型名称">{current.name}</Descriptions.Item>
            <Descriptions.Item label="模型类型">{current.type}</Descriptions.Item>
            <Descriptions.Item label="服务商">{current.provider}</Descriptions.Item>
            <Descriptions.Item label="Model ID">{current.modelId}</Descriptions.Item>
            <Descriptions.Item label="服务地址" span={2}>
              {current.baseUrl}
            </Descriptions.Item>
            <Descriptions.Item label="上下文">{current.contextWindow}</Descriptions.Item>
            <Descriptions.Item label="最大输出">{current.maxOutput}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Form form={form} layout="vertical" className="grid-form">
            <Form.Item name="name" label="模型名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="type" label="模型类型">
              <Select
                options={modelTypes.map((item) => ({ label: item, value: item }))}
                onChange={(value: ModelRecord['type']) => {
                  setLocalScanComplete(false)
                  setOllamaModels([])
                  if (value === '本地离线模型') {
                    form.setFieldsValue({ provider: 'Ollama', baseUrl: 'http://127.0.0.1:11434', modelId: '' })
                    void scanLocalModels()
                  }
                }}
              />
            </Form.Item>
            <Form.Item name="provider" label="服务商">
              <Select
                disabled={modelType === '本地离线模型'}
                options={['OpenAI', 'DeepSeek', 'Qwen', 'Ollama', 'LM Studio', '自定义'].map((item) => ({
                  label: item,
                  value: item
                }))}
              />
            </Form.Item>
            <Form.Item name="baseUrl" label="服务地址">
              <Input />
            </Form.Item>
            <Form.Item name="modelId" label="Model ID" rules={[{ required: true }]}>
              {modelType === '本地离线模型' ? (
                <Select
                  showSearch
                  loading={scanningLocalModels}
                  disabled={!localScanComplete}
                  placeholder="请先扫描并选择已安装模型"
                  options={ollamaModels.map((item) => ({ label: item.name, value: item.name }))}
                />
              ) : provider === 'Ollama' ? (
                <Select showSearch options={ollamaModels.map((item) => ({ label: item.name, value: item.name }))} />
              ) : (
                <Input />
              )}
            </Form.Item>
            {modelType === '本地离线模型' && (
              <Form.Item label="本地模型扫描">
                <Button loading={scanningLocalModels} onClick={() => void scanLocalModels()}>
                  扫描已安装模型
                </Button>
              </Form.Item>
            )}
            <Form.Item name="contextWindow" label="上下文长度">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxOutput" label="最大输出长度">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="timeout" label="超时(s)">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Flex>
  )
}
