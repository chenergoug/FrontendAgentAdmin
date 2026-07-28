import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { projectApi } from '../../src/api';
import type { ProjectRecord, ProjectTaskLog, ProjectTaskRecord, ProjectTaskStatus, ProjectTaskType } from '../../src/types';
import { formatDateTimeToSecond } from '../../src/utils/time';
import type { TaskPanelMode } from '../types';

const taskStatusColor: Record<ProjectTaskStatus, string> = {
  running: 'blue',
  success: 'green',
  failed: 'red',
  stopped: 'orange',
};

type TaskPanelProps = {
  project: ProjectRecord;
  mode: TaskPanelMode;
};

export function TaskPanel({ project, mode }: TaskPanelProps) {
  const [tasks, setTasks] = useState<ProjectTaskRecord[]>([]);
  const [logs, setLogs] = useState<ProjectTaskLog[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState('');
  const [loading, setLoading] = useState(false);

  const loadTaskLogs = useCallback(
    (taskId: string) => {
      return projectApi.taskLogs(project.id, taskId).then((result) => setLogs(result.list));
    },
    [project.id],
  );

  const loadTasks = useCallback(() => {
    projectApi
      .taskList(project.id)
      .then((result) => {
        setTasks(result.list);
        const nextCurrent = currentTaskId || result.list[0]?.id || '';
        if (nextCurrent) {
          setCurrentTaskId(nextCurrent);
          return loadTaskLogs(nextCurrent);
        }
        setLogs([]);
        return undefined;
      })
      .catch((error: Error) => message.error(error.message));
  }, [currentTaskId, loadTaskLogs, project.id]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!tasks.some((task) => task.status === 'running')) return;
    const timer = window.setInterval(loadTasks, 2000);
    return () => window.clearInterval(timer);
  }, [loadTasks, tasks]);

  const start = (type: ProjectTaskType) => {
    setLoading(true);
    projectApi
      .startTask(project.id, { type })
      .then((task) => {
        setCurrentTaskId(task.id);
        message.success('任务已启动');
        loadTasks();
      })
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  };

  const stop = (taskId: string) => {
    projectApi
      .stopTask(project.id, taskId)
      .then(() => {
        message.success('任务已停止');
        loadTasks();
      })
      .catch((error: Error) => message.error(error.message));
  };

  const columns: ColumnsType<ProjectTaskRecord> = [
    { title: '类型', dataIndex: 'type', width: 90 },
    { title: '命令', dataIndex: 'command', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 100, render: (value: ProjectTaskStatus) => <Tag color={taskStatusColor[value]}>{value}</Tag> },
    { title: '开始时间', dataIndex: 'startedAt', width: 170, render: formatDateTimeToSecond },
    { title: '结束时间', dataIndex: 'endedAt', width: 170, render: formatDateTimeToSecond },
    { title: '退出码', dataIndex: 'exitCode', width: 80, render: (value) => value ?? '-' },
    {
      title: '操作',
      width: 130,
      render: (_, task) => (
        <Space>
          <Button
            type="link"
            onClick={() => {
              setCurrentTaskId(task.id);
              loadTaskLogs(task.id);
            }}>
            日志
          </Button>
          {task.status === 'running' && (
            <Button danger type="link" onClick={() => stop(task.id)}>
              停止
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const availableTypes: ProjectTaskType[] = mode === 'runtime' ? ['dev'] : ['build', 'lint', 'test'];

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Card>
        <Space>
          {availableTypes.map((type) => (
            <Button key={type} type={type === 'dev' || type === 'build' ? 'primary' : 'default'} loading={loading} onClick={() => start(type)}>
              启动 {type}
            </Button>
          ))}
          <Button icon={<ReloadOutlined />} onClick={loadTasks}>
            刷新
          </Button>
        </Space>
      </Card>
      <Card title="任务列表">
        <Table columns={columns} dataSource={tasks} rowKey="id" pagination={false} size="middle" scroll={{ x: 'max-content' }} />
      </Card>
      <Card title="任务日志">
        {logs.length > 0 ? (
          <pre className="task-log-view">
            {logs.map((log) => `[${formatDateTimeToSecond(log.createdAt)}] ${log.stream}: ${log.text}`).join('')}
          </pre>
        ) : (
          <Empty description="暂无任务日志" />
        )}
      </Card>
    </Space>
  );
}
