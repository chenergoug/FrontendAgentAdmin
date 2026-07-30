import { EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Flex,
  Input,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { agentApi } from '../../src/api'
import type { AgentConfigurationRequest, AgentPlan, AgentPlanItem, ProjectRecord } from '../../src/types'
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
  const [plan, setPlan] = useState<AgentPlan | null>(null)
  const [planning, setPlanning] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<AgentPlanItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

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
    if (!planning.trim()) {
      message.warning('请先填写开发规划')
      return
    }
    setGenerating(true)
    try {
      const result = await agentApi.regeneratePlan(project.id, planning.trim())
      setPlan(result)
      setPlanning(result.planning)
      message.success('已根据当前规划重新生成 Agent 清单')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setGenerating(false)
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

  return (
    <Spin spinning={loading}>
      <Flex vertical gap={16}>
        <Card
          title="Agent 任务规划"
          extra={
            <Button type="primary" icon={<ReloadOutlined />} loading={generating} onClick={() => void regeneratePlan()}>
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
        </Card>

        <Card title="专项 Agent 分配">
          <Table columns={columns} dataSource={plan?.items ?? []} rowKey="key" pagination={false} tableLayout="fixed" />
        </Card>

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
