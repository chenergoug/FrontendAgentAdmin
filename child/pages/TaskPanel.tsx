import { CheckCircleOutlined, ReloadOutlined, ToolOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Popconfirm, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { fileChangeApi, projectApi } from '../../src/api';
import type { ProjectRecord, ProjectTaskLog, ProjectTaskRecord, ProjectTaskStatus, ProjectTaskType, ProjectValidationRecord } from '../../src/types';
import { formatDateTimeToSecond } from '../../src/utils/time';
import { stripAnsi } from '../../src/utils/text';
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
  onOpenChanges?: () => void;
};

export function TaskPanel({ project, mode, onOpenChanges }: TaskPanelProps) {
  const [tasks, setTasks] = useState<ProjectTaskRecord[]>([]);
  const [logs, setLogs] = useState<ProjectTaskLog[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState('');
  const [loading, setLoading] = useState(false);
  const [validations, setValidations] = useState<ProjectValidationRecord[]>([]);

  const loadTaskLogs = useCallback(
    (taskId: string) => {
      return projectApi.taskLogs(project.id, taskId).then((result) => setLogs(result.list));
    },
    [project.id],
  );

  const loadTasks = useCallback(async () => {
    return Promise.all([projectApi.taskList(project.id), projectApi.validationList(project.id)])
      .then(([result, validationResult]) => {
        setValidations(validationResult.list);
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
    const hasRunningTask = tasks.some((task) => task.status === 'running');
    const hasRunningValidation = validations.some((validation) => validation.status === 'running');
    if (!hasRunningTask && !hasRunningValidation) return;
    const timer = window.setInterval(loadTasks, 2000);
    return () => window.clearInterval(timer);
  }, [loadTasks, tasks, validations]);

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
  const latestValidation = validations[0];
  const repeatedFailureCount = latestValidation?.status === 'failed'
    ? validations.filter((item) => item.status === 'failed' && item.currentStep === latestValidation.currentStep).length
    : 0;

  const startValidation = async () => {
    setLoading(true);
    try {
      const validation = await projectApi.startValidation(project.id);
      setValidations((current) => [validation, ...current.filter((item) => item.id !== validation.id)]);
      message.success('一键验证已启动');
      await loadTasks();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const generateFix = async () => {
    if (!latestValidation?.report) return;
    setLoading(true);
    try {
      const result = await fileChangeApi.generate({
        projectId: project.id,
        agentId: 'a-debug',
        task: [
          `修复以下验证失败问题：\n\n${latestValidation.report}`,
          repeatedFailureCount > 1
            ? `同一 ${latestValidation.currentStep} 步骤已连续失败 ${repeatedFailureCount} 次。不得重复之前的无效修改；必须读取当前文件并检查配置语法、依赖声明和工具版本兼容性。`
            : '',
          '输出前必须确认修改后的配置文件语法有效，并从根因上解决日志中的首个错误。',
        ].filter(Boolean).join('\n\n'),
      });
      message.success(`已生成 ${result.files.length} 个修复文件`);
      onOpenChanges?.();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Card>
        <Space>
          {availableTypes.map((type) => (
            <Button key={type} type={type === 'dev' || type === 'build' ? 'primary' : 'default'} loading={loading} onClick={() => start(type)}>
              启动 {type}
            </Button>
          ))}
          {mode === 'build' ? <Popconfirm title="按顺序执行 Lint、测试和构建？" onConfirm={startValidation}><Button type="primary" icon={<CheckCircleOutlined />} loading={loading}>一键验证</Button></Popconfirm> : null}
          <Button icon={<ReloadOutlined />} onClick={loadTasks}>
            刷新
          </Button>
        </Space>
      </Card>
      {mode === 'build' && latestValidation ? (
        <Alert
          type={latestValidation.status === 'success' ? 'success' : latestValidation.status === 'failed' ? 'error' : 'info'}
          showIcon
          message={`一键验证：${latestValidation.status}${latestValidation.currentStep ? ` · ${latestValidation.currentStep}` : ''}`}
          description={latestValidation.status === 'failed' ? '验证已在失败步骤停止，可生成修复变更后重新执行。' : undefined}
          action={latestValidation.status === 'failed' ? <Button icon={<ToolOutlined />} onClick={generateFix}>生成修复变更</Button> : undefined}
        />
      ) : null}
      {mode === 'build' && repeatedFailureCount >= 2 ? (
        <Alert
          type="warning"
          showIcon
          message={`${latestValidation?.currentStep} 已连续失败 ${repeatedFailureCount} 次`}
          description="后续修复会携带历史失败次数并要求更换修复方案，避免重复生成相同的无效变更。"
        />
      ) : null}
      <Card title="任务列表">
        <Table columns={columns} dataSource={tasks} rowKey="id" pagination={false} size="middle" scroll={{ x: 'max-content' }} />
      </Card>
      <Card title="任务日志">
        {logs.length > 0 ? (
          <pre className="task-log-view">
            {logs.map((log) => `[${formatDateTimeToSecond(log.createdAt)}] ${log.stream}: ${stripAnsi(log.text)}`).join('')}
          </pre>
        ) : (
          <Empty description="暂无任务日志" />
        )}
      </Card>
    </Space>
  );
}
