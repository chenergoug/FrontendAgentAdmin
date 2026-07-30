import { CheckOutlined, CloseOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Descriptions, Drawer, Empty, List, Popconfirm, Row, Space, Spin, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { fileChangeApi, projectApi } from '../../src/api';
import type { FileChangeItem, FileChangeSet, ProjectFileNode, ProjectRecord } from '../../src/types';
import { formatDateTimeToSecond } from '../../src/utils/time';

const statusColor: Record<FileChangeSet['status'], string> = { pending: 'gold', applied: 'green', rejected: 'default', failed: 'red' };
const actionColor: Record<FileChangeItem['action'], string> = { create: 'green', update: 'blue', delete: 'red' };

function countProjectFiles(nodes: ProjectFileNode[]): number {
  return nodes.reduce((total, node) => total + (node.type === 'file' ? 1 : countProjectFiles(node.children ?? [])), 0);
}

export function FileChangesPanel({ project }: { project: ProjectRecord }) {
  const [changeSets, setChangeSets] = useState<FileChangeSet[]>([]);
  const [current, setCurrent] = useState<FileChangeSet | null>(null);
  const [preview, setPreview] = useState<FileChangeItem | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectFileCount, setProjectFileCount] = useState(0);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([fileChangeApi.list(project.id), projectApi.fileTree(project.id)])
      .then(([changeResult, treeResult]) => {
        setChangeSets(changeResult.list);
        setProjectFileCount(countProjectFiles(treeResult.list));
        setCurrent((value) => changeResult.list.find((item) => item.id === value?.id) ?? changeResult.list[0] ?? null);
      })
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, [project.id]);

  useEffect(() => loadData(), [loadData]);
  useEffect(() => setSelectedPaths(current?.files.filter((item) => item.selected).map((item) => item.path) ?? []), [current]);

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
                  <Alert
                    type="info"
                    showIcon
                    message={`当前变更集 ${current.files.length} 个文件；项目目录累计 ${projectFileCount} 个文件`}
                    description="右侧仅展示左侧当前选中的单次变更集，完整项目文件请在开发工作区查看。"
                  />
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
              ) : <Empty description="开发流程尚未生成文件变更" />}
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
