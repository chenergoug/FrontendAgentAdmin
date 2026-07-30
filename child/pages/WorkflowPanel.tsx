import { CheckCircleOutlined, HistoryOutlined, PlayCircleOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Collapse, Descriptions, Flex, Input, Modal, Space, Spin, Steps, Switch, Table, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fileChangeApi, workflowApi } from '../../src/api';
import type { ProjectRecord, WorkflowCapabilityReport, WorkflowHistoryRecord, WorkflowSnapshot, WorkflowStageKey, WorkflowStageStatus } from '../../src/types';
import { formatDateTimeToSecond } from '../../src/utils/time';

const statusMeta: Record<WorkflowStageStatus, { color: string; text: string }> = {
  pending: { color: 'default', text: '待执行' },
  running: { color: 'processing', text: '执行中' },
  review: { color: 'warning', text: '待确认' },
  approved: { color: 'success', text: '已完成' },
  failed: { color: 'error', text: '失败' },
};

const statusProgress: Record<WorkflowStageStatus, number> = {
  pending: 0,
  running: 1,
  review: 2,
  approved: 3,
  failed: 3,
};

function shouldReplaceWorkflow(previous: WorkflowSnapshot | null, next: WorkflowSnapshot) {
  if (!previous || previous.id !== next.id || previous.version !== next.version) return true;
  if (next.updatedAt !== previous.updatedAt) return next.updatedAt > previous.updatedAt;
  const previousProgress = previous.stages.reduce((total, stage) => total + statusProgress[stage.status], 0);
  const nextProgress = next.stages.reduce((total, stage) => total + statusProgress[stage.status], 0);
  return nextProgress >= previousProgress;
}

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
  const [capabilities, setCapabilities] = useState<WorkflowCapabilityReport | null>(null);
  const [rerunStageKey, setRerunStageKey] = useState<WorkflowStageKey | null>(null);
  const [rerunReason, setRerunReason] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<WorkflowHistoryRecord[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<WorkflowHistoryRecord | null>(null);
  const autoTransitionRef = useRef(false);
  const approvalInFlightRef = useRef(false);
  const autoModeRef = useRef(false);

  const loadWorkflow = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const snapshotRequest = workflowApi.detail(project.id)
      .then((snapshot) => {
        setWorkflow((previous) => shouldReplaceWorkflow(previous, snapshot) ? snapshot : previous);
        const runningStage = snapshot.stages.find((stage) => stage.status === 'running');
        if (snapshot.autoMode && (runningStage || autoTransitionRef.current)) {
          setSelectedKey(runningStage?.key ?? snapshot.activeStage);
        }
        return snapshot;
      });
    void workflowApi.capabilities(project.id)
      .then(setCapabilities)
      .catch((error: Error) => message.error(error.message))
    return snapshotRequest
      .catch((error: Error) => {
        message.error(error.message);
        return undefined;
      })
      .finally(() => !silent && setLoading(false));
  }, [project.id]);

  useEffect(() => { void loadWorkflow(); }, [loadWorkflow]);
  useEffect(() => setSelectedKey(initialStage), [initialStage]);
  useEffect(() => { autoModeRef.current = Boolean(workflow?.autoMode); }, [workflow?.autoMode]);

  useEffect(() => {
    const hasRunningStage = workflow?.stages.some((stage) => stage.status === 'running') ?? false;
    if (!executing && !hasRunningStage) return;
    const timer = window.setInterval(() => {
      void loadWorkflow(true);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [executing, loadWorkflow, workflow?.stages]);

  const selectedStage = useMemo(() => workflow?.stages.find((item) => item.key === selectedKey) ?? null, [selectedKey, workflow]);
  useEffect(() => {
    setInput(selectedStage?.input ?? '');
    setArtifact(selectedStage?.output ?? '');
  }, [selectedStage?.input, selectedStage?.output, selectedStage?.key]);

  const runAutoSequence = useCallback(async (initial: WorkflowSnapshot) => {
    if (autoTransitionRef.current) return initial;
    autoTransitionRef.current = true;
    let current = initial;
    try {
      while (current.autoMode) {
        const activeIndex = current.stages.findIndex((item) => item.key === current.activeStage);
        const activeStage = current.stages[activeIndex];
        if (!activeStage || ['failed', 'running'].includes(activeStage.status)) break;
        if (activeStage.status === 'review') {
          if (!activeStage.output.trim()) break;
          current = await workflowApi.approve(project.id, activeStage.key);
          setWorkflow(current);
          setSelectedKey(current.activeStage);
          continue;
        }
        const nextStage = activeStage.status === 'pending' ? activeStage : current.stages[activeIndex + 1];
        if (!nextStage) break;
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        if (!autoModeRef.current) break;
        setSelectedKey(nextStage.key);
        setWorkflow((previous) => previous ? {
          ...previous,
          activeStage: nextStage.key,
          stages: previous.stages.map((stage) => stage.key === nextStage.key ? { ...stage, status: 'running' } : stage),
        } : previous);
        current = await workflowApi.run(project.id, nextStage.key);
        setWorkflow(current);
        const completedStage = current.stages.find((item) => item.key === nextStage.key);
        if (!completedStage || ['failed', 'running'].includes(completedStage.status)) break;
      }
      return current;
    } finally {
      autoTransitionRef.current = false;
    }
  }, [project.id]);

  const approve = useCallback(async (continueAutomatically = false) => {
    if (!workflow || !selectedStage || approvalInFlightRef.current) return;
    approvalInFlightRef.current = true;
    setExecuting(true);
    try {
      const saved = artifact !== selectedStage.output
        ? await workflowApi.saveArtifact(project.id, selectedStage.key, artifact)
        : workflow;
      const approved = await workflowApi.approve(project.id, selectedStage.key);
      setWorkflow(approved);
      setSelectedKey(approved.activeStage);
      message.success(`${selectedStage.title}已确认`);
      if (continueAutomatically && approved.activeStage !== selectedStage.key) {
        await runAutoSequence(approved);
      }
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      approvalInFlightRef.current = false;
      setExecuting(false);
    }
  }, [artifact, project.id, runAutoSequence, selectedStage, workflow]);

  useEffect(() => {
    if (!workflow?.autoMode || selectedStage?.status !== 'review' || autoTransitionRef.current) return;
    setExecuting(true);
    void runAutoSequence(workflow)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setExecuting(false));
  }, [runAutoSequence, selectedStage?.key, selectedStage?.status, workflow]);

  const executeStage = async (stageKey: WorkflowStageKey, taskInput?: string) => {
    setExecuting(true);
    setWorkflow((previous) => previous ? {
      ...previous,
      activeStage: stageKey,
      stages: previous.stages.map((stage) => stage.key === stageKey ? { ...stage, status: 'running' } : stage),
    } : previous);
    try {
      const result = await workflowApi.run(project.id, stageKey, taskInput?.trim() || undefined);
      setWorkflow(result);
      const stage = result.stages.find((item) => item.key === stageKey);
      message[stage?.status === 'failed' ? 'error' : 'success'](stage?.status === 'failed' ? stage.error : `${stage?.title}执行完成`);
      if (result.autoMode) await runAutoSequence(result);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      await loadWorkflow(true);
      setExecuting(false);
    }
  };

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
    if (selectedStage.output || ['approved', 'review'].includes(selectedStage.status)) {
      setRerunStageKey(selectedStage.key);
      setRerunReason('');
      return;
    }
    await executeStage(selectedStage.key, input);
  };

  const confirmRerun = async () => {
    if (!workflow || !rerunStageKey || !rerunReason.trim()) {
      message.warning('请填写重新执行原因');
      return;
    }
    setExecuting(true);
    try {
      const prepared = await workflowApi.prepareRerun(project.id, rerunStageKey, rerunReason.trim());
      setWorkflow(prepared);
      setSelectedKey(rerunStageKey);
      setRerunStageKey(null);
      setRerunReason('');
      const result = await workflowApi.run(project.id, rerunStageKey, input.trim() || undefined);
      setWorkflow(result);
      if (result.autoMode) await runAutoSequence(result);
      message.success(`已创建工作流 v${prepared.version} 并开始重新执行`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      await loadWorkflow(true);
      setExecuting(false);
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const result = await workflowApi.history(project.id);
      setHistory(result.list);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setHistoryLoading(false);
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
    const messageKey = `generate-documentation-${project.id}`;
    setExecuting(true);
    message.loading({ key: messageKey, content: '正在生成项目文档，请稍候...', duration: 0 });
    try {
      const result = await fileChangeApi.generate({
        projectId: project.id,
        agentId: 'a-docs',
        task: `将以下交付文档产物生成到项目 README.md 和 docs 目录，输出待审批文件变更：\n\n${selectedStage.output}`,
      });
      message.success({ key: messageKey, content: `已生成 ${result.files.length} 个文档文件，正在打开文件变更`, duration: 2 });
      onOpenChanges?.();
    } catch (error) {
      message.error({ key: messageKey, content: (error as Error).message, duration: 4 });
    } finally {
      setExecuting(false);
    }
  };

  if (!workflow || !selectedStage) return <Spin spinning={loading} />;
  const selectedStatus = statusMeta[selectedStage.status];
  const selectedCapability = capabilities?.stages.find((item) => item.stageKey === selectedStage.key);
  const selectedStageIsRunning = selectedStage.status === 'running';
  const workflowIsRunning = executing || workflow.stages.some((stage) => stage.status === 'running');

  return (
    <Spin spinning={loading || workflowIsRunning} size="large" tip="工作流正在执行，请稍候...">
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
                  status: stage.status === 'approved' ? 'finish' : stage.status === 'failed' ? 'error' : stage.status === 'running' ? 'process' : 'wait',
                }))}
              />
            </div>
            <Space>
              <Typography.Text>自动执行</Typography.Text>
              <Switch disabled={workflowIsRunning} checked={workflow.autoMode} onChange={async (checked) => setWorkflow(await workflowApi.setMode(project.id, checked))} />
              <Button disabled={workflowIsRunning} icon={<HistoryOutlined />} onClick={() => void openHistory()}>历史版本</Button>
              <Button disabled={workflowIsRunning} icon={<ReloadOutlined />} onClick={() => loadWorkflow()}>刷新</Button>
            </Space>
          </Flex>
        </Card>

        {selectedCapability && !selectedCapability.available ? <Alert type="warning" showIcon message="当前节点能力不完整" description={selectedCapability.reasons.join('；')} /> : null}

        <Card title={selectedStage.title} extra={<Tag color={selectedStatus.color}>{selectedStatus.text}</Tag>}>
          <Descriptions size="small" bordered column={3}>
            <Descriptions.Item label="执行 Agent">{selectedStage.agentId}</Descriptions.Item>
            <Descriptions.Item label="工作流版本">v{workflow.version ?? 1}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatDateTimeToSecond(selectedStage.updatedAt)}</Descriptions.Item>
            <Descriptions.Item label="确认时间" span={3}>{formatDateTimeToSecond(selectedStage.confirmedAt)}</Descriptions.Item>
          </Descriptions>
          <Typography.Title level={5}>任务输入</Typography.Title>
          <Input.TextArea rows={4} value={input} onChange={(event) => setInput(event.target.value)} />
          <Space style={{ marginTop: 12 }}>
            <Button type="primary" icon={<PlayCircleOutlined />} loading={selectedStageIsRunning} disabled={workflowIsRunning} onClick={runStage}>
              {selectedStageIsRunning ? '执行中' : '执行当前节点'}
            </Button>
          </Space>
          {selectedStage.error ? <Alert style={{ marginTop: 16 }} type="error" showIcon message={selectedStage.error} /> : null}
          <Typography.Title level={5}>节点产物</Typography.Title>
          <Input.TextArea rows={16} value={artifact} onChange={(event) => setArtifact(event.target.value)} placeholder="执行完成后将在此生成可编辑产物" />
          <Space style={{ marginTop: 12 }}>
            <Button icon={<SaveOutlined />} disabled={workflowIsRunning || !artifact.trim()} onClick={saveArtifact}>保存修改</Button>
            <Button type="primary" icon={<CheckCircleOutlined />} disabled={workflowIsRunning || !artifact.trim()} onClick={() => approve(workflow.autoMode)}>确认并进入下一步</Button>
            {['review', 'debug'].includes(selectedStage.key) ? <Button disabled={workflowIsRunning || !artifact.trim()} onClick={generateRepair}>生成修复变更</Button> : null}
            {selectedStage.key === 'docs' ? <Button disabled={workflowIsRunning || !artifact.trim()} onClick={generateDocumentation}>生成项目文档</Button> : null}
          </Space>
        </Card>

        <Modal
          title="重新执行工作流节点"
          open={Boolean(rerunStageKey)}
          centered
          mask={{ closable: false }}
          okText="归档并重新执行"
          cancelText="取消"
          confirmLoading={executing}
          onOk={() => void confirmRerun()}
          onCancel={() => { setRerunStageKey(null); setRerunReason(''); }}
        >
          <Alert
            type="warning"
            showIcon
            message={workflow.stages.every((stage) => stage.status === 'approved') ? '当前工作流已经全部完成' : '当前节点已有执行结果'}
            description={`继续执行将归档当前 v${workflow.version ?? 1}，并重置“${workflow.stages.find((stage) => stage.key === rerunStageKey)?.title ?? '-'}”及其后续节点。原产物不会删除。${workflow.autoMode ? '自动执行已开启，确认后将继续推进后续流程。' : ''}`}
          />
          <Typography.Title level={5}>重新执行原因</Typography.Title>
          <Input.TextArea value={rerunReason} onChange={(event) => setRerunReason(event.target.value)} rows={4} maxLength={1000} showCount placeholder="说明需求变化、修复原因或重新生成目标" />
        </Modal>

        <Modal title="工作流历史版本" open={historyOpen} centered width={960} footer={null} onCancel={() => setHistoryOpen(false)}>
          <Table
            loading={historyLoading}
            dataSource={history}
            rowKey="historyId"
            pagination={false}
            columns={[
              { title: '版本', width: 90, render: (_, item) => `v${item.version ?? 1}` },
              { title: '归档时间', dataIndex: 'archivedAt', width: 180, render: formatDateTimeToSecond },
              { title: '重跑起点', dataIndex: 'rerunFrom', width: 130, render: (key: WorkflowStageKey, item) => item.stages.find((stage) => stage.key === key)?.title ?? key },
              { title: '重新执行原因', dataIndex: 'rerunReason', ellipsis: true },
              { title: '操作', width: 90, render: (_, item) => <Button type="link" onClick={() => setSelectedHistory(item)}>查看</Button> },
            ]}
          />
        </Modal>

        <Modal title={`历史工作流 v${selectedHistory?.version ?? 1}`} open={Boolean(selectedHistory)} centered width={900} footer={null} onCancel={() => setSelectedHistory(null)}>
          {selectedHistory ? (
            <>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="归档时间">{formatDateTimeToSecond(selectedHistory.archivedAt)}</Descriptions.Item>
                <Descriptions.Item label="重跑起点">{selectedHistory.stages.find((stage) => stage.key === selectedHistory.rerunFrom)?.title ?? selectedHistory.rerunFrom}</Descriptions.Item>
                <Descriptions.Item label="重新执行原因" span={2}>{selectedHistory.rerunReason}</Descriptions.Item>
              </Descriptions>
              <Collapse
                style={{ marginTop: 16 }}
                items={selectedHistory.stages.map((stage) => ({
                  key: stage.key,
                  label: <Space><span>{stage.title}</span><Tag color={statusMeta[stage.status].color}>{statusMeta[stage.status].text}</Tag></Space>,
                  children: <pre className="task-log-view">{stage.output || '该节点没有归档产物'}</pre>,
                }))}
              />
            </>
          ) : null}
        </Modal>
      </Flex>
    </Spin>
  );
}
