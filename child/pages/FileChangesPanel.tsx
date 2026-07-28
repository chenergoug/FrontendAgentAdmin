import { CheckOutlined, CloseOutlined, EyeOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Col, Descriptions, Drawer, Empty, Input, List, Popconfirm, Row, Select, Space, Spin, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { agentApi, fileChangeApi } from '../../src/api';
import type { AgentRecord, FileChangeItem, FileChangeSet, ProjectRecord } from '../../src/types';
import { formatDateTimeToSecond } from '../../src/utils/time';

const statusColor: Record<FileChangeSet['status'], string> = { pending: 'gold', applied: 'green', rejected: 'default', failed: 'red' };
const actionColor: Record<FileChangeItem['action'], string> = { create: 'green', update: 'blue', delete: 'red' };

export function FileChangesPanel({ project }: { project: ProjectRecord }) {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [changeSets, setChangeSets] = useState<FileChangeSet[]>([]);
  const [current, setCurrent] = useState<FileChangeSet | null>(null);
  const [preview, setPreview] = useState<FileChangeItem | null>(null);
  const [agentId, setAgentId] = useState('');
  const [task, setTask] = useState('根据已确认的需求、架构和开发计划，生成下一批可运行的项目代码。');
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([agentApi.list({ page: 1, pageSize: 100 }), fileChangeApi.list(project.id)])
      .then(([agentResult, changeResult]) => {
        const developmentAgents = agentResult.list.filter((item) => ['前端开发', '后端开发'].includes(item.category) && item.enabled);
        setAgents(developmentAgents);
        setAgentId((value) => value || developmentAgents[0]?.id || '');
        setChangeSets(changeResult.list);
        setCurrent((value) => changeResult.list.find((item) => item.id === value?.id) ?? changeResult.list[0] ?? null);
      })
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, [project.id]);

  useEffect(() => loadData(), [loadData]);
  useEffect(() => setSelectedPaths(current?.files.filter((item) => item.selected).map((item) => item.path) ?? []), [current]);

  const generate = async () => {
    if (!agentId) return message.warning('请选择开发 Agent');
    if (!task.trim()) return message.warning('请输入代码生成任务');
    setLoading(true);
    try {
      const result = await fileChangeApi.generate({ projectId: project.id, agentId, task: task.trim() });
      setCurrent(result);
      message.success(`已生成 ${result.files.length} 个待审批文件`);
      loadData();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const applyChanges = async () => {
    if (!current) return;
    setLoading(true);
    try {
      const result = await fileChangeApi.apply(current.id, selectedPaths);
      setCurrent(result);
      message.success('所选文件已写入项目，原文件已备份');
      loadData();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const rejectChanges = async () => {
    if (!current) return;
    setLoading(true);
    try {
      setCurrent(await fileChangeApi.reject(current.id));
      message.success('变更集已拒绝');
      loadData();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnsType<FileChangeItem> = [
    { title: '文件路径', dataIndex: 'path', ellipsis: true },
    { title: '操作', dataIndex: 'action', width: 90, render: (value: FileChangeItem['action']) => <Tag color={actionColor[value]}>{value}</Tag> },
    { title: '行数', width: 80, render: (_, item) => item.content ? item.content.split(/\r?\n/).length : 0 },
    { title: '预览', width: 80, render: (_, item) => <Button type="link" icon={<EyeOutlined />} onClick={() => setPreview(item)}>查看</Button> },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size={16} className="full-width">
        <Card title="生成文件变更">
          <Row gutter={12}>
            <Col span={6}><Select value={agentId || undefined} placeholder="开发 Agent" options={agents.map((item) => ({ label: item.name, value: item.id }))} onChange={setAgentId} /></Col>
            <Col span={14}><Input value={task} onChange={(event) => setTask(event.target.value)} /></Col>
            <Col span={4}><Button block type="primary" icon={<PlayCircleOutlined />} onClick={generate}>生成变更</Button></Col>
          </Row>
        </Card>

        <Row gutter={16}>
          <Col span={7}>
            <Card title="变更历史" extra={<Button icon={<ReloadOutlined />} onClick={loadData} />}>
              <List
                dataSource={changeSets}
                locale={{ emptyText: <Empty description="暂无变更" /> }}
                renderItem={(item) => (
                  <List.Item onClick={() => setCurrent(item)} style={{ cursor: 'pointer' }}>
                    <List.Item.Meta title={<Space><Typography.Text>{item.summary}</Typography.Text><Tag color={statusColor[item.status]}>{item.status}</Tag></Space>} description={`${item.files.length} 个文件 · ${formatDateTimeToSecond(item.createdAt)}`} />
                  </List.Item>
                )}
              />
            </Card>
          </Col>
          <Col span={17}>
            <Card
              title="待审批文件"
              extra={current?.status === 'pending' ? (
                <Space>
                  <Popconfirm title="确认拒绝整个变更集？" onConfirm={rejectChanges}><Button danger icon={<CloseOutlined />}>拒绝</Button></Popconfirm>
                  <Popconfirm title="确认将所选文件写入项目？" description="写入前会自动备份现有文件。" onConfirm={applyChanges}><Button type="primary" icon={<CheckOutlined />}>应用所选</Button></Popconfirm>
                </Space>
              ) : null}
            >
              {current ? (
                <Space direction="vertical" className="full-width">
                  <Descriptions size="small" bordered column={3}>
                    <Descriptions.Item label="状态"><Tag color={statusColor[current.status]}>{current.status}</Tag></Descriptions.Item>
                    <Descriptions.Item label="Agent Run">{current.agentRunId}</Descriptions.Item>
                    <Descriptions.Item label="应用时间">{formatDateTimeToSecond(current.appliedAt)}</Descriptions.Item>
                  </Descriptions>
                  <Table
                    rowKey="path"
                    columns={columns}
                    dataSource={current.files}
                    pagination={false}
                    rowSelection={current.status === 'pending' ? { selectedRowKeys: selectedPaths, onChange: (keys) => setSelectedPaths(keys.map(String)) } : undefined}
                  />
                </Space>
              ) : <Empty description="请选择或生成变更集" />}
            </Card>
          </Col>
        </Row>
      </Space>
      <Drawer title={preview?.path} width="70%" open={Boolean(preview)} onClose={() => setPreview(null)}>
        {preview ? (
          <Space direction="vertical" className="full-width">
            <Tag color={actionColor[preview.action]}>{preview.action}</Tag>
            <Typography.Title level={5}>生成内容</Typography.Title>
            <pre className="task-log-view">{preview.content || '(删除文件)'}</pre>
            {preview.originalContent ? <><Typography.Title level={5}>原始内容</Typography.Title><pre className="task-log-view">{preview.originalContent}</pre></> : null}
          </Space>
        ) : null}
      </Drawer>
    </Spin>
  );
}
