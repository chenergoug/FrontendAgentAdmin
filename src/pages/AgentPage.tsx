import { ExportOutlined, ImportOutlined, PlusOutlined } from '@ant-design/icons'
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
  Switch,
  Table,
  Tag,
  Upload,
  message
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { agentApi } from '../api'
import { TableToolbar } from '../components/TableToolbar'
import type { AgentRecord, PageResult } from '../types'
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

type ModalMode = 'create' | 'edit' | 'detail' | null

const defaultCategories = [
  '主调度',
  '需求分析',
  '架构设计',
  '实现规划',
  '前端开发',
  '后端开发',
  '代码审核',
  '调试修复',
  '测试构建',
  '文档',
  '自定义'
]

function createAgent(): AgentRecord {
  return {
    id: '',
    name: '',
    category: '自定义',
    modelName: '线上代码模型',
    risk: '中',
    enabled: true,
    description: '',
    prompt: '',
    permissions: ['读取文件', '生成 Diff'],
    approvalRules: ['写文件需要确认']
  }
}

export function AgentPage() {
  const [form] = Form.useForm<AgentRecord>()
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<string | undefined>()
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [current, setCurrent] = useState<AgentRecord>(createAgent())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PageResult<AgentRecord>>({ list: [], total: 0, page: 1, pageSize: 10 })
  const { tableWrapperRef, scrollY } = useTableScrollY([data.list.length, loading, page, pageSize])

  const loadData = useCallback(() => {
    setLoading(true)
    agentApi
      .list({ page, pageSize, keyword, category })
      .then(setData)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false))
  }, [category, keyword, page, pageSize])

  useEffect(() => {
    loadData()
  }, [loadData])

  const categories = useMemo(
    () => Array.from(new Set(data.list.map((item) => item.category).concat(defaultCategories))),
    [data.list]
  )

  const open = (mode: ModalMode, agent = createAgent()) => {
    setCurrent(agent)
    setModalMode(mode)
    form.setFieldsValue(agent)
  }

  const save = async () => {
    const values = await form.validateFields()
    try {
      const payload = {
        ...values,
        permissions: values.permissions ?? current.permissions,
        approvalRules: values.approvalRules ?? current.approvalRules
      }
      if (modalMode === 'create') {
        await agentApi.create(payload)
      } else {
        await agentApi.update(current.id, payload)
      }
      message.success('Agent 配置已保存')
      setModalMode(null)
      loadData()
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const deleteAgent = async (id: string) => {
    try {
      await agentApi.delete(id)
      message.success('Agent 已删除')
      loadData()
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const importAgents = async (file: File) => {
    try {
      const data = await readJsonFile(file)
      const result = await agentApi.importData(data)
      message.success(`成功导入 ${result.imported} 条 Agent 配置`)
      setSelectedRowKeys([])
      loadData()
    } catch (error) {
      showImportError(error)
    }
  }

  const exportAgents = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择需要导出的 Agent')
      return
    }
    try {
      const selectedIds = selectedRowKeys.map(String)
      const selectedIdSet = new Set(selectedIds)
      const exportResult = await agentApi.exportData(selectedIds)
      const items = exportResult.items.filter((item) => selectedIdSet.has(item.id))
      if (items.length !== selectedIds.length) {
        message.error('导出数据和选中数据不一致，请刷新列表后重试')
        return
      }
      const selectedItems = selectedIds
        .map((id) => data.list.find((item) => item.id === id) ?? items.find((item) => item.id === id))
        .filter(Boolean) as AgentRecord[]
      downloadJson(exportSelectionFilename(selectedItems, 'Agent集合'), { ...exportResult, total: items.length, items })
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const columns: ColumnsType<AgentRecord> = withIndexColumn<AgentRecord>(
    [
      {
        title: 'Agent 名称',
        dataIndex: 'name',
        width: 180,
        render: (_, item) => (
          <Button type="link" onClick={() => open('detail', item)}>
            {item.name}
          </Button>
        )
      },
      { title: '类型', dataIndex: 'category', width: 120 },
      { title: '默认模型', dataIndex: 'modelName', width: 160 },
      {
        title: '风险等级',
        dataIndex: 'risk',
        width: 100,
        render: (value) => <Tag color={value === '高' ? 'red' : value === '中' ? 'orange' : 'green'}>{value}</Tag>
      },
      {
        title: '状态',
        dataIndex: 'enabled',
        width: 90,
        render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>
      },
      { title: '职责描述', dataIndex: 'description', ellipsis: true },
      {
        title: '操作',
        width: 170,
        render: (_, item) => (
          <Space>
            <Button type="link" onClick={() => open('detail', item)}>
              查看
            </Button>
            <Button type="link" onClick={() => open('edit', item)}>
              编辑
            </Button>
            <Popconfirm
              title="确认删除 Agent？"
              description={`确认删除「${item.name}」吗？`}
              onConfirm={() => deleteAgent(item.id)}
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
          setCategory(undefined)
          setPage(1)
        }}>
        <Select
          allowClear
          placeholder="Agent 类型"
          value={category}
          onChange={(value) => {
            setCategory(value)
            setPage(1)
          }}
          style={{ width: 150 }}
          options={categories.map((item) => ({ label: item, value: item }))}
        />
      </TableToolbar>
      <Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('create')}>
          新增专属 Agent
        </Button>
        <Upload
          accept=".json"
          showUploadList={false}
          beforeUpload={(file) => {
            void importAgents(file)
            return Upload.LIST_IGNORE
          }}>
          <Button icon={<ImportOutlined />}>导入 Agent</Button>
        </Upload>
        <Button icon={<ExportOutlined />} onClick={exportAgents}>
          导出 Agent
        </Button>
        <Button>Agent Builder 生成草稿</Button>
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
        title={modalMode === 'create' ? '新增 Agent' : modalMode === 'edit' ? '编辑 Agent' : 'Agent 详情'}
        open={modalMode !== null}
        onCancel={() => setModalMode(null)}
        onOk={save}
        footer={modalMode === 'detail' ? (_, { CancelBtn }) => <CancelBtn /> : undefined}
        width={860}
        okText="保存"
        cancelText="取消">
        {modalMode === 'detail' ? (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="名称">{current.name}</Descriptions.Item>
            <Descriptions.Item label="类型">{current.category}</Descriptions.Item>
            <Descriptions.Item label="模型">{current.modelName}</Descriptions.Item>
            <Descriptions.Item label="风险">{current.risk}</Descriptions.Item>
            <Descriptions.Item label="职责" span={2}>
              {current.description}
            </Descriptions.Item>
            <Descriptions.Item label="Prompt" span={2}>
              {current.prompt}
            </Descriptions.Item>
            <Descriptions.Item label="权限" span={2}>
              {current.permissions.join('、')}
            </Descriptions.Item>
            <Descriptions.Item label="审批规则" span={2}>
              {current.approvalRules.join('、')}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Form form={form} layout="vertical" className="grid-form">
            <Form.Item name="name" label="Agent 名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="category" label="Agent 类型">
              <Select options={categories.map((item) => ({ label: item, value: item }))} />
            </Form.Item>
            <Form.Item name="modelName" label="默认模型">
              <Input />
            </Form.Item>
            <Form.Item name="risk" label="风险等级">
              <Select options={['低', '中', '高'].map((item) => ({ label: item, value: item }))} />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="description" label="职责描述" className="wide-form-item">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item name="prompt" label="角色 Prompt" className="wide-form-item">
              <Input.TextArea rows={5} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Flex>
  )
}
