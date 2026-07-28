import { CheckCircleOutlined, PlayCircleOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Flex, Input, Modal, Space, Spin, Steps, Switch, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fileChangeApi, workflowApi } from '../../src/api';
import type { ProjectRecord, WorkflowCapabilityReport, WorkflowSnapshot, WorkflowStageKey, WorkflowStageStatus } from '../../src/types';
import { formatDateTimeToSecond } from '../../src/utils/time';

const statusMeta: Record<WorkflowStageStatus, { color: string; text: string }> = {
  pending: { color: 'default', text: '待执行' },
  running: { color: 'processing', text: '执行中' },
  review: { color: 'warning', text: '待确认' },
  approved: { color: 'success', text: '已完成' },
  failed: { color: 'error', text: '失败' },
};

type WorkflowPanelProps = {
  project: ProjectRecord;
  initialStage: WorkflowStageKey;
  onOpenChanges?: () => void;
};

export function WorkflowPanel({ project, initialStage, onOpenChanges }: WorkflowPanelProps) {
  const [workflow, setWorkflow] = useState<WorkflowSnapshot | null>(null);
  const [selectedKey, setSelectedKey] = useState<WorkflowStageKey>(initialStage);
  const [input, setInput] = useState('');
  const [artifact, setArtifact] = useState('');
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [capabilities, setCapabilities] = useState<WorkflowCapabilityReport | null>(null);

  const loadWorkflow = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([workflowApi.detail(project.id), workflowApi.capabilities(project.id)])
      .then(([snapshot, report]) => { setWorkflow(snapshot); setCapabilities(report); })
      .catch((error: Error) => message.error(error.message))
      .finally(() => !silent && setLoading(false));
  }, [project.id]);

  useEffect(() => loadWorkflow(), [loadWorkflow]);
  useEffect(() => setSelectedKey(initialStage), [initialStage]);

  const selectedStage = useMemo(() => workflow?.stages.find((item) => item.key === selectedKey) ?? null, [selectedKey, workflow]);
  useEffect(() => {
    setInput(selectedStage?.input ?? '');
    setArtifact(selectedStage?.output ?? '');
  }, [selectedStage?.input, selectedStage?.output, selectedStage?.key]);

  const approve = useCallback(async (continueAutomatically = false) => {
    if (!workflow || !selectedStage) return;
    setExecuting(true);
    try {
      const saved = artifact !== selectedStage.output
        ? await workflowApi.saveArtifact(project.id, selectedStage.key, artifact)
        : workflow;
      const approved = await workflowApi.approve(project.id, selectedStage.key);
      setWorkflow(approved);
      setSelectedKey(approved.activeStage);
      setCountdown(null);
      message.success(`${selectedStage.title}已确认`);
      if (continueAutomatically && approved.activeStage !== selectedStage.key) {
        const next = await workflowApi.run(project.id, approved.activeStage);
        setWorkflow(next);
        setSelectedKey(next.activeStage);
      }
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setExecuting(false);
    }
  }, [artifact, project.id, selectedStage, workflow]);

  useEffect(() => {
    if (!workflow?.autoMode || selectedStage?.status !== 'review') {
      setCountdown(null);
      return;
    }
    setCountdown(workflow.autoApproveSeconds);
    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value === null) return null;
        if (value <= 1) {
          window.clearInterval(timer);
          void approve(true);
          return null;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [approve, selectedStage?.key, selectedStage?.status, workflow?.autoApproveSeconds, workflow?.autoMode]);

  const runStage = async () => {
    if (!selectedStage) return;
    const capability = capabilities?.stages.find((item) => item.stageKey === selectedStage.key);
    if (capability && !capability.available) {
      Modal.warning({
        title: `${selectedStage.title}暂不可执行`,
        content: <Space direction="vertical">{capability.reasons.map((reason) => <Typography.Text key={reason}>{reason}</Typography.Text>)}<Typography.Text type="secondary">请在主客户端补充配置后点击刷新，无需重启子客户端，当前记录不会丢失。</Typography.Text></Space>,
      });
      return;
    }
    setExecuting(true);
    try {
      const result = await workflowApi.run(project.id, selectedStage.key, input.trim() || undefined);
      setWorkflow(result);
      const stage = result.stages.find((item) => item.key === selectedStage.key);
      message[stage?.status === 'failed' ? 'error' : 'success'](stage?.status === 'failed' ? stage.error : `${stage?.title}执行完成`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setExecuting(false);
    }
  };

  const saveArtifact = async () => {
    if (!selectedStage) return;
    setExecuting(true);
    try {
      setWorkflow(await workflowApi.saveArtifact(project.id, selectedStage.key, artifact));
      message.success('产物已保存');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setExecuting(false);
    }
  };

  const generateRepair = async () => {
    if (!selectedStage?.output) return;
    setExecuting(true);
    try {
      const result = await fileChangeApi.generate({
        projectId: project.id,
        agentId: 'a-debug',
        task: `根据以下代码审核或调试报告生成最小修复变更集：\n\n${selectedStage.output}`,
      });
      message.success(`已生成 ${result.files.length} 个修复文件，请在文件变更中审批`);
      onOpenChanges?.();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setExecuting(false);
    }
  };

  const generateDocumentation = async () => {
    if (!selectedStage?.output) return;
    setExecuting(true);
    try {
      const result = await fileChangeApi.generate({
        projectId: project.id,
        agentId: 'a-docs',
        task: `将以下交付文档产物生成到项目 README.md 和 docs 目录，输出待审批文件变更：\n\n${selectedStage.output}`,
      });
      message.success(`已生成 ${result.files.length} 个文档文件，请审批`);
      onOpenChanges?.();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setExecuting(false);
    }
  };

  if (!workflow || !selectedStage) return <Spin spinning={loading} />;
  const selectedStatus = statusMeta[selectedStage.status];
  const selectedCapability = capabilities?.stages.find((item) => item.stageKey === selectedStage.key);

  return (
    <Spin spinning={loading || executing}>
      <Flex vertical gap={16}>
        <Card>
          <Flex className="workflow-toolbar" align="center" gap={16}>
            <div className="workflow-steps-scroll">
              <Steps
                className="workflow-steps"
                current={Math.max(0, workflow.stages.findIndex((item) => item.key === selectedKey))}
                responsive={false}
                onChange={(index) => {
                  const stage = workflow.stages[index];
                  if (stage) setSelectedKey(stage.key);
                }}
                items={workflow.stages.map((stage) => ({
                  title: stage.title,
                  description: statusMeta[stage.status].text,
                  status: stage.status === 'approved' ? 'finish' : stage.status === 'failed' ? 'error' : stage.key === selectedKey ? 'process' : 'wait',
                }))}
              />
            </div>
            <Space>
              <Typography.Text>自动执行</Typography.Text>
              <Switch checked={workflow.autoMode} onChange={async (checked) => setWorkflow(await workflowApi.setMode(project.id, checked))} />
              <Button icon={<ReloadOutlined />} onClick={() => loadWorkflow()}>刷新</Button>
            </Space>
          </Flex>
        </Card>

        {countdown !== null ? (
          <Alert type="warning" showIcon message={`${countdown} 秒后自动确认并执行下一节点`} action={<Button size="small" onClick={() => workflowApi.setMode(project.id, false).then(setWorkflow)}>切换手动执行</Button>} />
        ) : null}

        {selectedCapability && !selectedCapability.available ? <Alert type="warning" showIcon message="当前节点能力不完整" description={selectedCapability.reasons.join('；')} /> : null}

        <Card title={selectedStage.title} extra={<Tag color={selectedStatus.color}>{selectedStatus.text}</Tag>}>
          <Descriptions size="small" bordered column={3}>
            <Descriptions.Item label="执行 Agent">{selectedStage.agentId}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatDateTimeToSecond(selectedStage.updatedAt)}</Descriptions.Item>
            <Descriptions.Item label="确认时间">{formatDateTimeToSecond(selectedStage.confirmedAt)}</Descriptions.Item>
          </Descriptions>
          <Typography.Title level={5}>任务输入</Typography.Title>
          <Input.TextArea rows={4} value={input} onChange={(event) => setInput(event.target.value)} />
          <Space style={{ marginTop: 12 }}>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={runStage}>执行当前节点</Button>
          </Space>
          {selectedStage.error ? <Alert style={{ marginTop: 16 }} type="error" showIcon message={selectedStage.error} /> : null}
          <Typography.Title level={5}>节点产物</Typography.Title>
          <Input.TextArea rows={16} value={artifact} onChange={(event) => setArtifact(event.target.value)} placeholder="执行完成后将在此生成可编辑产物" />
          <Space style={{ marginTop: 12 }}>
            <Button icon={<SaveOutlined />} disabled={!artifact.trim()} onClick={saveArtifact}>保存修改</Button>
            <Button type="primary" icon={<CheckCircleOutlined />} disabled={!artifact.trim()} onClick={() => approve(false)}>确认并进入下一步</Button>
            {['review', 'debug'].includes(selectedStage.key) ? <Button disabled={!artifact.trim()} onClick={generateRepair}>生成修复变更</Button> : null}
            {selectedStage.key === 'docs' ? <Button disabled={!artifact.trim()} onClick={generateDocumentation}>生成项目文档</Button> : null}
          </Space>
        </Card>
      </Flex>
    </Spin>
  );
}
