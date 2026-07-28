import { PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Descriptions, Empty, Input, Row, Select, Space, Spin, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { agentApi, agentRunApi, modelApi } from '../../src/api';
import type { AgentRecord, AgentRunRecord, AgentRunStatus, ModelRecord, ProjectRecord } from '../../src/types';
import { formatDateTimeToSecond } from '../../src/utils/time';
import type { AgentWorkspaceMode } from '../types';

const runStatusColor: Record<AgentRunStatus, string> = {
  queued: 'default',
  running: 'blue',
  success: 'green',
  failed: 'red',
  stopped: 'orange',
};

const modeDefaults: Record<AgentWorkspaceMode, { title: string; category?: string; input: string }> = {
  general: {
    title: 'Agent 任务',
    input: '请根据当前项目配置，给出下一步可执行的开发建议。',
  },
  requirements: {
    title: '需求分析',
    category: '需求分析',
    input: '请基于当前项目介绍和原始需求，生成结构化 PRD、页面功能拆分、角色权限和待确认问题。',
  },
  plan: {
    title: '开发计划',
    category: '架构设计',
    input: '请根据当前项目需求，输出整体技术架构、页面开发计划、接口契约、文件拆分策略和执行顺序。',
  },
  review: {
    title: '代码审核',
    category: '代码审核',
    input: '请基于当前项目配置，输出代码审核标准、重点风险和后续接入真实代码后的审核清单。',
  },
};

type AgentWorkspacePanelProps = {
  project: ProjectRecord;
  mode: AgentWorkspaceMode;
};

export function AgentWorkspacePanel({ project, mode }: AgentWorkspacePanelProps) {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [runs, setRuns] = useState<AgentRunRecord[]>([]);
  const [currentRun, setCurrentRun] = useState<AgentRunRecord | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [taskInput, setTaskInput] = useState(modeDefaults[mode].input);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const modeConfig = modeDefaults[mode];

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      agentApi.list({ page: 1, pageSize: 100 }),
      modelApi.list({ page: 1, pageSize: 100 }),
      agentRunApi.list({ page: 1, pageSize: 20, projectId: project.id }),
    ])
      .then(([agentResult, modelResult, runResult]) => {
        setAgents(agentResult.list);
        setModels(modelResult.list);
        setRuns(runResult.list);
        setCurrentRun(runResult.list[0] ?? null);
        const preferred = modeConfig.category ? agentResult.list.find((item) => item.category === modeConfig.category) : agentResult.list[0];
        setSelectedAgentId((value) => value || preferred?.id || '');
      })
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, [modeConfig.category, project.id]);

  useEffect(() => {
    setTaskInput(modeDefaults[mode].input);
    setSelectedAgentId('');
  }, [mode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedAgent = useMemo(() => agents.find((item) => item.id === selectedAgentId), [agents, selectedAgentId]);
  const selectedModel = useMemo(() => {
    if (!selectedAgent) return null;
    return models.find((item) => item.name === selectedAgent.modelName) ?? models.find((item) => item.provider === 'Ollama') ?? null;
  }, [models, selectedAgent]);

  const startRun = () => {
    if (!selectedAgentId) {
      message.warning('请选择 Agent');
      return;
    }
    if (!taskInput.trim()) {
      message.warning('请输入任务说明');
      return;
    }
    setRunning(true);
    agentRunApi
      .start({ projectId: project.id, agentId: selectedAgentId, input: taskInput.trim() })
      .then((run) => {
        setCurrentRun(run);
        message[run.status === 'success' ? 'success' : 'error'](run.status === 'success' ? 'Agent 执行完成' : 'Agent 执行失败');
        loadData();
      })
      .catch((error: Error) => message.error(error.message))
      .finally(() => setRunning(false));
  };

  const columns: ColumnsType<AgentRunRecord> = [
    { title: 'Agent', dataIndex: 'agentName', width: 150 },
    { title: '模型', dataIndex: 'modelId', width: 180 },
    { title: '状态', dataIndex: 'status', width: 90, render: (value: AgentRunStatus) => <Tag color={runStatusColor[value]}>{value}</Tag> },
    { title: '开始时间', dataIndex: 'startedAt', width: 170, render: formatDateTimeToSecond },
    { title: '结束时间', dataIndex: 'endedAt', width: 170, render: formatDateTimeToSecond },
    {
      title: '操作',
      width: 90,
      render: (_, run) => (
        <Button type="link" onClick={() => setCurrentRun(run)}>
          查看
        </Button>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size={16} className="full-width">
        <Card title={modeConfig.title}>
          <Row gutter={16}>
            <Col span={8}>
              <Space direction="vertical" size={12} className="full-width">
                <Select
                  placeholder="选择 Agent"
                  value={selectedAgentId || undefined}
                  onChange={setSelectedAgentId}
                  options={agents.map((item) => ({ label: `${item.name} / ${item.category}`, value: item.id }))}
                />
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="默认模型">{selectedAgent?.modelName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="实际模型">{selectedModel?.modelId || '-'}</Descriptions.Item>
                  <Descriptions.Item label="风险等级">{selectedAgent?.risk || '-'}</Descriptions.Item>
                </Descriptions>
              </Space>
            </Col>
            <Col span={16}>
              <Space direction="vertical" size={12} className="full-width">
                <Input.TextArea value={taskInput} onChange={(event) => setTaskInput(event.target.value)} rows={6} />
                <Space>
                  <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={startRun}>
                    执行 Agent
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={loadData}>
                    刷新
                  </Button>
                </Space>
              </Space>
            </Col>
          </Row>
        </Card>

        <Card title="执行记录">
          <Table columns={columns} dataSource={runs} rowKey="id" pagination={false} scroll={{ x: 'max-content' }} />
        </Card>

        <Card title="执行结果">
          {currentRun ? (
            <Space direction="vertical" size={12} className="full-width">
              <Descriptions bordered size="small" column={3}>
                <Descriptions.Item label="Agent">{currentRun.agentName}</Descriptions.Item>
                <Descriptions.Item label="模型">{currentRun.modelId}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={runStatusColor[currentRun.status]}>{currentRun.status}</Tag>
                </Descriptions.Item>
              </Descriptions>
              {currentRun.error ? <Alert type="error" showIcon message={currentRun.error} /> : null}
              <Typography.Paragraph>
                <pre className="task-log-view">{currentRun.output || currentRun.input}</pre>
              </Typography.Paragraph>
            </Space>
          ) : (
            <Empty description="暂无执行结果" />
          )}
        </Card>
      </Space>
    </Spin>
  );
}
