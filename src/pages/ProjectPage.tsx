import { ExportOutlined, FolderOpenOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Flex, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Upload, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Key } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { projectApi } from '../api';
import { TableToolbar } from '../components/TableToolbar';
import type { PageResult, ProjectDeviceType, ProjectRecord, ProjectShape, ProjectStatus } from '../types';
import { downloadJson, exportSelectionFilename, readJsonFile, showImportError } from '../utils/transfer';
import {
  tableCardBodyStyle,
  tableCardInnerStyle,
  tableCardStyle,
  createTableScroll,
  tablePageSizeOptions,
  tablePageSizeSelectOptions,
  tablePageStyle,
  useTableScrollY,
  withIndexColumn,
} from '../utils/table';
import { formatDateTimeToSecond } from '../utils/time';

type ModalMode = 'create' | 'edit' | 'detail' | null;

const shapeOptions: ProjectShape[] = ['纯前端', '纯后端', '全栈 Monorepo', '前后端分离'];
const deviceOptions: ProjectDeviceType[] = ['PC端', '小程序', 'Android', 'iOS', '移动端', '桌面端'];
const statusText: Record<ProjectStatus, string> = {
  draft: '草稿',
  ready: '已配置',
  running: '子客户端运行中',
  locked: '配置锁定',
  error: '异常',
};
const statusColor: Record<ProjectStatus, string> = {
  draft: 'gold',
  ready: 'green',
  running: 'blue',
  locked: 'orange',
  error: 'red',
};
const projectClientEventKey = 'frontend-agent-project-client-event';

function createProject(): ProjectRecord {
  return {
    id: '',
    name: '',
    source: '新建',
    shape: '纯前端',
    deviceType: 'PC端',
    businessType: '后台管理',
    rootPath: '',
    gitRemote: '',
    branch: 'develop',
    serverUrl: '',
    devCommand: 'pnpm dev',
    buildCommand: 'pnpm build',
    lintCommand: 'pnpm lint',
    testCommand: 'pnpm test',
    configVersion: 1,
    status: 'draft',
    updatedAt: '',
    description: '',
    requirement: '',
  };
}

export function ProjectPage() {
  const [form] = Form.useForm<ProjectRecord>();
  const [keyword, setKeyword] = useState('');
  const [shape, setShape] = useState<ProjectShape | undefined>();
  const [deviceType, setDeviceType] = useState<ProjectDeviceType | undefined>();
  const [status, setStatus] = useState<ProjectStatus | undefined>();
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [currentProject, setCurrentProject] = useState<ProjectRecord>(createProject());
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [data, setData] = useState<PageResult<ProjectRecord>>({ list: [], total: 0, page: 1, pageSize: 10 });
  const { tableWrapperRef, scrollY } = useTableScrollY([data.list.length, loading, page, pageSize]);
  const childWindowsRef = useRef(new Map<string, Window>());

  const loadData = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    projectApi
      .list({ page, pageSize, keyword, shape, deviceType, status })
      .then(setData)
      .catch((error: Error) => message.error(error.message))
      .finally(() => {
        if (!silent) {
          setLoading(false);
        }
      });
  }, [deviceType, keyword, page, pageSize, shape, status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const reloadProjectStatus = () => {
      loadData(true);
      window.setTimeout(() => loadData(true), 350);
    };

    const unsubscribe = window.frontendAgent?.onProjectClientChanged?.(reloadProjectStatus);
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('frontend-agent-project-client');
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; projectId?: string } | undefined;
      if (data?.type === 'project-client-closed' || data?.type === 'project-client-opened') {
        reloadProjectStatus();
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === projectClientEventKey && event.newValue) {
        reloadProjectStatus();
      }
    };
    const onFocus = () => reloadProjectStatus();
    const onVisibilityChange = () => {
      if (!document.hidden) {
        reloadProjectStatus();
      }
    };

    channel?.addEventListener('message', onMessage);
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      unsubscribe?.();
      channel?.removeEventListener('message', onMessage);
      channel?.close();
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      childWindowsRef.current.forEach((childWindow, projectId) => {
        if (!childWindow.closed) {
          return;
        }

        childWindowsRef.current.delete(projectId);
        projectApi
          .closeClient(projectId)
          .then(() => loadData(true))
          .catch(() => undefined);
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (!data.list.some((item) => item.status === 'running')) {
      return;
    }

    const timer = window.setInterval(() => loadData(true), 3000);
    return () => window.clearInterval(timer);
  }, [data.list, loadData]);

  const openModal = (mode: ModalMode, project = createProject()) => {
    setCurrentProject(project);
    setModalMode(mode);
    form.setFieldsValue(project);
  };

  const closeModal = () => {
    setModalMode(null);
    form.resetFields();
  };

  const saveProject = async () => {
    const values = await form.validateFields();
    const reservedChildWindow = modalMode === 'create' && !window.frontendAgent
      ? window.open('about:blank', 'frontend-agent-child-pending')
      : null;
    if (modalMode === 'create' && !window.frontendAgent && !reservedChildWindow) {
      message.error('浏览器阻止了新页面打开，请允许弹窗后重试');
      return;
    }
    try {
      if (modalMode === 'create') {
        const created = await projectApi.create(values);
        closeModal();
        await openProjectClient(created.id, reservedChildWindow);
        loadData();
        return;
      } else {
        await projectApi.update(currentProject.id, values);
      }
      message.success('项目配置已保存');
      closeModal();
      loadData();
    } catch (error) {
      reservedChildWindow?.close();
      message.error((error as Error).message);
    }
  };

  const reset = () => {
    setKeyword('');
    setShape(undefined);
    setDeviceType(undefined);
    setStatus(undefined);
    setPage(1);
  };

  const runAction = async (action: () => Promise<unknown>, successText: string) => {
    try {
      await action();
      message.success(successText);
      loadData();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const openProjectClient = (projectId: string, reservedChildWindow?: Window | null) =>
    runAction(async () => {
      if (window.frontendAgent?.openProjectClient) {
        await projectApi.openClient(projectId);
        try {
          await window.frontendAgent.openProjectClient(projectId);
        } catch (error) {
          await projectApi.closeClient(projectId).catch(() => undefined);
          throw error;
        }
        return;
      }

      const childWindow = reservedChildWindow ?? window.open('about:blank', `frontend-agent-child-${projectId}`);
      if (!childWindow) {
        throw new Error('浏览器阻止了新页面打开，请允许弹窗后重试');
      }

      try {
        await projectApi.openClient(projectId);
        childWindowsRef.current.set(projectId, childWindow);
        childWindow.location.href = `${window.location.origin}/child.html?projectId=${encodeURIComponent(projectId)}`;
        childWindow.focus();
      } catch (error) {
        childWindow.close();
        throw error;
      }
    }, '子客户端已打开');

  const closeProjectClient = (projectId: string) =>
    runAction(async () => {
      if (window.frontendAgent?.closeProjectClient) {
        await window.frontendAgent.closeProjectClient(projectId);
        return;
      }
      const payload = { type: 'project-client-force-closed', projectId };
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('frontend-agent-project-client');
        channel.postMessage(payload);
        channel.close();
      }
      localStorage.setItem(projectClientEventKey, JSON.stringify({ ...payload, timestamp: Date.now() }));
      const childWindow = childWindowsRef.current.get(projectId);
      childWindow?.postMessage(payload, window.location.origin);
      childWindow?.close();
      childWindowsRef.current.delete(projectId);
      await projectApi.closeClient(projectId);
    }, '子客户端已关闭');

  const importProjects = async (file: File) => {
    try {
      const data = await readJsonFile(file);
      const result = await projectApi.importData(data);
      message.success(`成功导入 ${result.imported} 条项目配置`);
      setSelectedRowKeys([]);
      loadData();
    } catch (error) {
      showImportError(error);
    }
  };

  const exportProjects = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择需要导出的项目');
      return;
    }
    try {
      const selectedIds = selectedRowKeys.map(String);
      const selectedIdSet = new Set(selectedIds);
      const exportResult = await projectApi.exportData(selectedIds);
      const items = exportResult.items.filter((item) => selectedIdSet.has(item.id));
      if (items.length !== selectedIds.length) {
        message.error('导出数据和选中数据不一致，请刷新列表后重试');
        return;
      }
      const selectedItems = selectedIds
        .map((id) => data.list.find((item) => item.id === id) ?? items.find((item) => item.id === id))
        .filter(Boolean) as ProjectRecord[];
      downloadJson(exportSelectionFilename(selectedItems, '项目集合'), { ...exportResult, total: items.length, items });
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const columns: ColumnsType<ProjectRecord> = withIndexColumn<ProjectRecord>([
    { title: '项目名称', dataIndex: 'name', width: 180, render: (_, record) => <Button type="link" onClick={() => openModal('detail', record)}>{record.name}</Button> },
    { title: '项目形态', dataIndex: 'shape', width: 140 },
    { title: '项目类型', dataIndex: 'deviceType', width: 100 },
    { title: '业务类型', dataIndex: 'businessType', width: 220, ellipsis: true },
    { title: 'Git 地址', dataIndex: 'gitRemote', width: 260, ellipsis: true, render: (value: string) => value || '-' },
    { title: '默认分支', dataIndex: 'branch', width: 110 },
    { title: '服务器地址', dataIndex: 'serverUrl', width: 240, ellipsis: true, render: (value: string) => value || '-' },
    { title: '配置版本', dataIndex: 'configVersion', width: 100, render: (value: number) => `v${value}` },
    { title: '状态', dataIndex: 'status', width: 140, render: (value: ProjectStatus) => <Tag color={statusColor[value]}>{statusText[value]}</Tag> },
    { title: '更新时间', dataIndex: 'updatedAt', width: 180, render: formatDateTimeToSecond },
    {
      title: '操作',
      key: 'action',
      width: 230,
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => openModal('detail', record)}>详情</Button>
          <Button type="link" disabled={record.status === 'running'} onClick={() => openModal('edit', record)}>编辑</Button>
          {record.status === 'running' ? (
            <Button danger type="link" onClick={() => closeProjectClient(record.id)}>关闭</Button>
          ) : (
            <Button type="link" onClick={() => openProjectClient(record.id)}>打开</Button>
          )}
          <Popconfirm
            title="确认删除项目？"
            description={`将从列表移除「${record.name}」，不会删除本地项目文件。`}
            okText="确认"
            cancelText="取消"
            disabled={record.status === 'running'}
            onConfirm={() => runAction(() => projectApi.delete(record.id), '项目已删除')}
          >
            <Button danger disabled={record.status === 'running'} type="link">删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], page, pageSize);

  const readonly = modalMode === 'detail' || currentProject.status === 'running';
  const shapeSelectOptions = useMemo(() => shapeOptions.map((item) => ({ label: item, value: item })), []);
  const deviceSelectOptions = useMemo(() => deviceOptions.map((item) => ({ label: item, value: item })), []);

  return (
    <Flex vertical gap={16} style={tablePageStyle}>
      <TableToolbar keyword={keyword} onKeywordChange={(value) => { setKeyword(value); setPage(1); }} onReset={reset} onSearch={() => setPage(1)}>
        <Select allowClear placeholder="项目形态" value={shape} onChange={(value) => { setShape(value); setPage(1); }} style={{ width: 160 }} options={shapeSelectOptions} />
        <Select allowClear placeholder="项目类型" value={deviceType} onChange={(value) => { setDeviceType(value); setPage(1); }} style={{ width: 140 }} options={deviceSelectOptions} />
        <Select allowClear placeholder="状态" value={status} onChange={(value) => { setStatus(value); setPage(1); }} style={{ width: 150 }} options={Object.entries(statusText).map(([value, label]) => ({ label, value }))} />
      </TableToolbar>
      <Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal('create')}>新建项目</Button>
        <Upload accept=".json" showUploadList={false} beforeUpload={(file) => { void importProjects(file); return Upload.LIST_IGNORE; }}>
          <Button icon={<FolderOpenOutlined />}>导入项目</Button>
        </Upload>
        <Button icon={<ExportOutlined />} onClick={exportProjects}>导出项目</Button>
      </Space>
      <div ref={tableWrapperRef} style={tableCardStyle}>
      <Card style={tableCardInnerStyle} styles={{ body: tableCardBodyStyle }}>
        <Table
          columns={columns}
          dataSource={data.list}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total: data.total,
            showSizeChanger: { options: tablePageSizeSelectOptions },
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            pageSizeOptions: tablePageSizeOptions,
          }}
          rowKey="id"
          rowSelection={{
            preserveSelectedRowKeys: true,
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          scroll={createTableScroll(scrollY)}
          onChange={(pagination) => {
            setPage(pagination.current ?? 1);
            setPageSize(pagination.pageSize ?? 10);
          }}
        />
      </Card>
      </div>
      <Modal
        title={modalMode === 'create' ? '新建项目' : modalMode === 'edit' ? '编辑项目' : '项目详情'}
        open={modalMode !== null}
        onCancel={closeModal}
        onOk={saveProject}
        okText="保存"
        cancelText={modalMode === 'detail' ? '关闭' : '取消'}
        footer={modalMode === 'detail' ? (_, { CancelBtn }) => <CancelBtn /> : undefined}
        width={980}
      >
        {modalMode === 'detail' ? (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="项目名称">{currentProject.name}</Descriptions.Item>
            <Descriptions.Item label="项目形态">{currentProject.shape}</Descriptions.Item>
            <Descriptions.Item label="项目类型">{currentProject.deviceType}</Descriptions.Item>
            <Descriptions.Item label="业务类型">{currentProject.businessType}</Descriptions.Item>
            <Descriptions.Item label="项目路径" span={2}>{currentProject.rootPath}</Descriptions.Item>
            <Descriptions.Item label="Git 地址" span={2}>{currentProject.gitRemote || '-'}</Descriptions.Item>
            <Descriptions.Item label="服务器地址" span={2}>{currentProject.serverUrl || '-'}</Descriptions.Item>
            <Descriptions.Item label="项目介绍" span={2}>{currentProject.description}</Descriptions.Item>
            <Descriptions.Item label="原始需求" span={2}>{currentProject.requirement}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Form form={form} layout="vertical" disabled={readonly} className="grid-form">
            <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}><Input /></Form.Item>
            <Form.Item name="shape" label="项目形态" rules={[{ required: true }]}><Select options={shapeSelectOptions} /></Form.Item>
            <Form.Item name="deviceType" label="项目类型" rules={[{ required: true }]}><Select options={deviceSelectOptions} /></Form.Item>
            <Form.Item name="businessType" label="业务类型"><Input /></Form.Item>
            <Form.Item name="rootPath" label="项目路径" rules={[{ required: true, message: '请输入项目路径' }]}><Input placeholder="选择文件夹或创建新文件夹" /></Form.Item>
            <Form.Item name="gitRemote" label="Git 地址"><Input /></Form.Item>
            <Form.Item name="branch" label="默认分支"><Input /></Form.Item>
            <Form.Item name="serverUrl" label="服务器地址"><Input /></Form.Item>
            <Form.Item name="devCommand" label="运行命令"><Input /></Form.Item>
            <Form.Item name="buildCommand" label="构建命令"><Input /></Form.Item>
            <Form.Item name="lintCommand" label="Lint 命令"><Input /></Form.Item>
            <Form.Item name="testCommand" label="测试命令"><Input /></Form.Item>
            <Form.Item name="description" label="项目介绍" className="wide-form-item"><Input.TextArea rows={3} /></Form.Item>
            <Form.Item name="requirement" label="原始需求" className="wide-form-item"><Input.TextArea rows={4} /></Form.Item>
          </Form>
        )}
      </Modal>
    </Flex>
  );
}
