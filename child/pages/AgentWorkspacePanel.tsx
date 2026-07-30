import { EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useRef, useState } from 'react'
import { agentApi, projectApi, workflowApi } from '../../src/api'
import type { AgentConfigurationRequest, AgentPlan, AgentPlanItem, ProjectInfrastructureInput, ProjectRecord, TechnologyRecommendation } from '../../src/types'
import type { AgentWorkspaceMode } from '../types'

type AgentWorkspacePanelProps = {
  project: ProjectRecord
  mode: AgentWorkspaceMode
}

async function openMainAgentConfiguration(request: AgentConfigurationRequest) {
  if (window.frontendAgent?.requestMainAgentConfiguration) {
    const result = await window.frontendAgent.requestMainAgentConfiguration(request)
    if (!result.opened) throw new Error('主客户端当前不可用')
    return
  }
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ type: 'frontend-agent-open-configuration', request }, window.location.origin)
    window.opener.focus()
    return
  }
  throw new Error('未找到主客户端，请从主客户端项目中心重新打开当前项目')
}

export function AgentWorkspacePanel({ project }: AgentWorkspacePanelProps) {
  const [infrastructureForm] = Form.useForm<ProjectInfrastructureInput>()
  const [plan, setPlan] = useState<AgentPlan | null>(null)
  const [currentProject, setCurrentProject] = useState(project)
  const [planning, setPlanning] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<AgentPlanItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const generatingRef = useRef(false)
  const lastGenerateAtRef = useRef(0)
  const [infrastructureOpen, setInfrastructureOpen] = useState(false)
  const [savingInfrastructure, setSavingInfrastructure] = useState(false)
  const [savingTechnology, setSavingTechnology] = useState(false)

  const needsDatabaseConfiguration = Boolean(plan?.needsDatabase && !currentProject.databasePasswordConfigured)
  const needsServerConfiguration = Boolean(plan?.needsServer && !currentProject.serverUrl)

  const loadPlan = useCallback(() => {
    setLoading(true)
    agentApi
      .plan(project.id)
      .then((result) => {
        setPlan(result)
        setPlanning(result.planning)
      })
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false))
  }, [project.id])

  useEffect(() => loadPlan(), [loadPlan])

  const regeneratePlan = async () => {
    const now = Date.now()
    if (generatingRef.current || now - lastGenerateAtRef.current < 800) return
    if (!planning.trim()) {
      message.warning('请先填写开发规划')
      return
    }
    generatingRef.current = true
    lastGenerateAtRef.current = now
    setGenerating(true)
    try {
      const workflow = await workflowApi.detail(project.id)
      if (workflow.stages.some((stage) => stage.status !== 'pending')) {
        message.warning('开发工作流已经开始，不能重新生成 Agent 清单；请先处理当前工作流')
        return
      }
      const previous = plan
      const result = await agentApi.regeneratePlan(project.id, planning.trim())
      setPlan(result)
      setPlanning(result.planning)
      if ((result.needsDatabase && !currentProject.databasePasswordConfigured) || (result.needsServer && !currentProject.serverUrl)) {
        infrastructureForm.setFieldsValue({
          configureDatabase: result.needsDatabase,
          configureServer: result.needsServer,
          databaseType: currentProject.databaseType || 'MySQL',
          databaseHost: currentProject.databaseHost || '127.0.0.1',
          databasePort: currentProject.databasePort || '3306',
          databaseName: currentProject.databaseName,
          databaseUsername: currentProject.databaseUsername,
          serverUrl: currentProject.serverUrl,
        })
        setInfrastructureOpen(true)
      }
      const capabilityChanged = previous ? (
        previous.hasFrontend !== result.hasFrontend ||
        previous.hasBackend !== result.hasBackend ||
        previous.needsDatabase !== result.needsDatabase ||
        previous.needsServer !== result.needsServer
      ) : false
      const agentListChanged = previous ? (
        previous.items.map((item) => item.key).join(',') !== result.items.map((item) => item.key).join(',')
      ) : false
      message.success(
        !previous
          ? '项目分析与 Agent 清单已生成'
          : capabilityChanged || agentListChanged
            ? `项目分析已更新${agentListChanged ? '，Agent 清单已调整' : '，现有 Agent 清单仍可覆盖需求'}`
            : '已重新分析需求，能力与 Agent 清单无需调整'
      )
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  const saveInfrastructure = async () => {
    const values = await infrastructureForm.validateFields()
    setSavingInfrastructure(true)
    try {
      const updated = await projectApi.updateInfrastructure(project.id, {
        ...values,
        configureDatabase: Boolean(plan?.needsDatabase),
        configureServer: Boolean(plan?.needsServer),
      })
      setCurrentProject(updated)
      setInfrastructureOpen(false)
      message.success('项目基础设施配置已保存')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setSavingInfrastructure(false)
    }
  }

  const configureAgent = async (item: AgentPlanItem) => {
    try {
      await openMainAgentConfiguration(
        item.agent
          ? { mode: 'edit', agentId: item.agent.id, task: item.task }
          : { mode: 'create', draft: item.proposedAgent, task: item.task }
      )
      message.success(item.agent ? '已在主客户端打开 Agent 编辑' : '已在主客户端生成 Agent 配置草稿')
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const updateTechnologySelection = (area: string, selected: string) => {
    setPlan((current) => current
      ? {
        ...current,
        technologyRecommendations: current.technologyRecommendations.map((item) =>
          item.area === area ? { ...item, selected, confirmed: false } : item
        ),
      }
      : current)
  }

  const saveTechnologyRecommendations = async () => {
    if (!plan) return
    const recommendations = plan.technologyRecommendations.map((item) => ({
      ...item,
      selected: (item.selected ?? item.recommended).trim(),
      confirmed: true,
    }))
    const invalid = recommendations.find((item) => !item.selected)
    if (invalid) {
      message.warning(`${invalid.area} 需要选择或填写最终方案`)
      return
    }
    setSavingTechnology(true)
    try {
      const result = await agentApi.saveTechnologyRecommendations(project.id, recommendations)
      setPlan(result)
      setPlanning(result.planning)
      message.success('技术选型已确认，后续流程将按最终方案执行')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setSavingTechnology(false)
    }
  }

  const columns: ColumnsType<AgentPlanItem> = [
    { title: '序号', width: 64, align: 'center', render: (_value, _item, index) => index + 1 },
    { title: '所需 Agent', dataIndex: 'name', width: 160, ellipsis: true },
    { title: '类型', dataIndex: 'category', width: 110, ellipsis: true },
    {
      title: '状态',
      width: 105,
      render: (_, item) => (
        <Tag color={item.available ? 'success' : 'warning'}>{item.available ? '已就绪' : '缺少 Agent'}</Tag>
      )
    },
    { title: '实际 Agent', width: 160, ellipsis: true, render: (_, item) => item.agent?.name ?? '-' },
    { title: '本次开发任务', dataIndex: 'task', ellipsis: true },
    {
      title: '操作',
      width: 250,
      render: (_, item) => (
        <Space size={4}>
          <Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedPlan(item)}>
            查看
          </Button>
          <Button
            type="link"
            icon={item.agent ? <EditOutlined /> : <PlusOutlined />}
            onClick={() => void configureAgent(item)}>
            {item.agent ? '主客户端编辑' : '一键创建'}
          </Button>
        </Space>
      )
    }
  ]

  const technologyColumns: ColumnsType<TechnologyRecommendation> = [
    { title: '选型领域', dataIndex: 'area', width: 140, ellipsis: true },
    {
      title: '推荐方案',
      dataIndex: 'recommended',
      width: 260,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '备选方案',
      dataIndex: 'alternatives',
      width: 300,
      render: (values: string[]) => values.length > 0
        ? <Space size={[4, 4]} wrap>{values.map((value) => <Tag key={value}>{value}</Tag>)}</Space>
        : '-',
    },
    {
      title: '最终采用方案',
      width: 300,
      render: (_, item) => {
        const selected = (item.selected ?? item.recommended).trim()
        const options = Array.from(new Set([item.recommended, ...item.alternatives].filter(Boolean)))
          .map((value) => ({ label: value, value }))
        return (
          <Select
            mode="tags"
            value={selected ? [selected] : []}
            options={options}
            placeholder="选择或输入最终方案"
            onChange={(values) => updateTechnologySelection(item.area, values.at(-1) ?? '')}
            style={{ width: '100%' }}
          />
        )
      },
    },
    {
      title: '确认状态',
      width: 100,
      align: 'center',
      render: (_, item) => (
        <Tag color={item.confirmed ? 'success' : 'warning'}>{item.confirmed ? '已确认' : '待确认'}</Tag>
      ),
    },
    { title: '推荐理由', dataIndex: 'reason', width: 360, ellipsis: true },
  ]

  return (
    <Spin
      spinning={loading || generating}
      size="large"
      tip={generating ? '正在分析项目并生成 Agent 清单...' : '正在加载项目 Agent 规划...'}>
      <Flex vertical gap={16}>
        <Card
          title="Agent 任务规划"
          extra={
            <Button type="primary" icon={<ReloadOutlined />} loading={generating} disabled={generating} onClick={() => void regeneratePlan()}>
              按规划生成 Agent 清单
            </Button>
          }>
          <Typography.Title level={5}>开发规划</Typography.Title>
          <Input.TextArea
            value={planning}
            onChange={(event) => setPlanning(event.target.value)}
            rows={5}
            maxLength={10000}
            showCount
            placeholder="根据项目需求描述本次开发范围、阶段、需要或不需要的能力"
          />
          <Alert
            style={{ marginTop: 16 }}
            type={plan?.items.some((item) => !item.available) ? 'warning' : 'success'}
            showIcon
            message={plan?.summary ?? '正在生成 Agent 规划'}
            description={
              plan?.items.some((item) => !item.available)
                ? '缺失的专项 Agent 需要前往主客户端创建。创建完成后再次生成清单即可，无需重启子客户端。'
                : undefined
            }
          />
          {plan ? (
            <Descriptions bordered size="small" column={4} style={{ marginTop: 16 }}>
              <Descriptions.Item label="前端能力">
                <Tag color={plan.hasFrontend ? 'blue' : 'default'}>{plan.hasFrontend ? '需要' : '不需要'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="后端能力">
                <Tag color={plan.hasBackend ? 'blue' : 'default'}>{plan.hasBackend ? '需要' : '不需要'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="数据库">
                <Tag color={plan.needsDatabase ? 'orange' : 'default'}>{plan.needsDatabase ? '需要配置' : '暂不需要'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="服务器">
                <Tag color={plan.needsServer ? 'orange' : 'default'}>{plan.needsServer ? '需要配置' : '暂不需要'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="分析依据" span={4}>{plan.reasoning}</Descriptions.Item>
              <Descriptions.Item label="待用户确认" span={4}>
                {plan.pendingQuestions.length > 0
                  ? plan.pendingQuestions.map((item) => <div key={item}>- {item}</div>)
                  : '无'}
              </Descriptions.Item>
            </Descriptions>
          ) : null}
          {(needsDatabaseConfiguration || needsServerConfiguration) ? (
            <Button style={{ marginTop: 16 }} onClick={() => setInfrastructureOpen(true)}>
              完善数据库与服务器配置
            </Button>
          ) : null}
        </Card>

        <Card
          title="技术选型建议"
          extra={
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={savingTechnology}
              disabled={!plan || savingTechnology || plan.technologyRecommendations.length === 0}
              onClick={() => void saveTechnologyRecommendations()}>
              确认技术选型
            </Button>
          }>
          <Table
            columns={technologyColumns}
            dataSource={plan?.technologyRecommendations ?? []}
            rowKey={(item) => `${item.area}-${item.recommended}`}
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: 1460 }}
            locale={{ emptyText: '生成 Agent 清单后显示技术选型建议' }}
          />
        </Card>

        <Card title="专项 Agent 分配">
          <Table columns={columns} dataSource={plan?.items ?? []} rowKey="key" pagination={false} tableLayout="fixed" />
        </Card>

        <Modal
          title="完善项目基础设施配置"
          open={infrastructureOpen}
          centered
          mask={{ closable: false }}
          confirmLoading={savingInfrastructure}
          onOk={() => void saveInfrastructure()}
          onCancel={() => setInfrastructureOpen(false)}
          okText="保存配置"
          width={680}>
          <Form form={infrastructureForm} layout="vertical">
            {plan?.needsDatabase ? (
              <>
                <Typography.Title level={5}>数据库配置</Typography.Title>
                <Flex gap={12} wrap>
                  <Form.Item name="databaseType" label="数据库类型" rules={[{ required: true }]} style={{ flex: '1 1 180px' }}>
                    <Select options={['MySQL', 'PostgreSQL', 'MongoDB', 'SQLite'].map((value) => ({ label: value, value }))} />
                  </Form.Item>
                  <Form.Item name="databaseHost" label="主机" rules={[{ required: true }]} style={{ flex: '2 1 260px' }}><Input /></Form.Item>
                  <Form.Item name="databasePort" label="端口" rules={[{ required: true }]} style={{ flex: '1 1 120px' }}><Input /></Form.Item>
                </Flex>
                <Flex gap={12} wrap>
                  <Form.Item name="databaseName" label="数据库名称" rules={[{ required: true }]} style={{ flex: '1 1 200px' }}><Input /></Form.Item>
                  <Form.Item name="databaseUsername" label="账号" rules={[{ required: true }]} style={{ flex: '1 1 200px' }}><Input /></Form.Item>
                  <Form.Item name="databasePassword" label="密码" rules={[{ required: !currentProject.databasePasswordConfigured }]} style={{ flex: '1 1 200px' }}><Input.Password /></Form.Item>
                </Flex>
              </>
            ) : null}
            {plan?.needsServer ? (
              <>
                <Typography.Title level={5}>服务器配置</Typography.Title>
                <Form.Item name="serverUrl" label="服务器地址" rules={[{ required: true }, { type: 'url' }]}><Input placeholder="https://example.com" /></Form.Item>
              </>
            ) : null}
          </Form>
        </Modal>

        <Modal
          title={selectedPlan?.name ? `${selectedPlan.name}详情` : 'Agent 详情'}
          open={Boolean(selectedPlan)}
          centered
          destroyOnHidden
          mask={{ closable: false }}
          onCancel={() => setSelectedPlan(null)}
          footer={(_, { CancelBtn }) => <CancelBtn />}
          width={820}
          styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }}>
          {selectedPlan ? (
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="类型">{selectedPlan.category}</Descriptions.Item>
              <Descriptions.Item label="状态">{selectedPlan.available ? '已就绪' : '缺少 Agent'}</Descriptions.Item>
              <Descriptions.Item label="本次任务" span={2}>
                {selectedPlan.task}
              </Descriptions.Item>
              <Descriptions.Item label="职责" span={2}>
                {(selectedPlan.agent ?? selectedPlan.proposedAgent).description}
              </Descriptions.Item>
              <Descriptions.Item label="默认模型">
                {(selectedPlan.agent ?? selectedPlan.proposedAgent).modelName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="风险等级">
                {(selectedPlan.agent ?? selectedPlan.proposedAgent).risk}
              </Descriptions.Item>
              <Descriptions.Item label="角色 Prompt" span={2}>
                <Typography.Paragraph>{(selectedPlan.agent ?? selectedPlan.proposedAgent).prompt}</Typography.Paragraph>
              </Descriptions.Item>
              <Descriptions.Item label="工具权限" span={2}>
                {(selectedPlan.agent ?? selectedPlan.proposedAgent).permissions.join('、')}
              </Descriptions.Item>
              <Descriptions.Item label="审批规则" span={2}>
                {(selectedPlan.agent ?? selectedPlan.proposedAgent).approvalRules.join('、')}
              </Descriptions.Item>
              <Descriptions.Item label="上下文规则" span={2}>
                {((selectedPlan.agent ?? selectedPlan.proposedAgent).contextRules ?? []).join('、')}
              </Descriptions.Item>
              <Descriptions.Item label="输出规范" span={2}>
                {(selectedPlan.agent ?? selectedPlan.proposedAgent).outputFormat || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="质量门禁" span={2}>
                {((selectedPlan.agent ?? selectedPlan.proposedAgent).qualityGates ?? []).join('、')}
              </Descriptions.Item>
            </Descriptions>
          ) : null}
        </Modal>
      </Flex>
    </Spin>
  )
}
