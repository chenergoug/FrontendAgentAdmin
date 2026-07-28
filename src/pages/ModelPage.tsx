import { ExportOutlined, ImportOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Flex, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Upload, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Key } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { modelApi, ollamaApi } from '../api';
import { TableToolbar } from '../components/TableToolbar';
import type { ModelRecord, OllamaModelTag, PageResult } from '../types';
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

const modelTypes: ModelRecord['type'][] = ['线上模型', '本地离线模型'];

function createModel(): ModelRecord {
  return {
    id: '',
    name: '',
    type: '线上模型',
    provider: 'OpenAI',
    baseUrl: '',
    modelId: '',
    contextWindow: 32768,
    maxOutput: 4096,
    timeout: 120,
    enabled: true,
    healthy: false,
    checkedAt: '未检查',
  };
}

export function ModelPage() {
  const [form] = Form.useForm<ModelRecord>();
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState<ModelRecord['type'] | undefined>();
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [current, setCurrent] = useState<ModelRecord>(createModel());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PageResult<ModelRecord>>({ list: [], total: 0, page: 1, pageSize: 10 });
  const [ollamaModels, setOllamaModels] = useState<OllamaModelTag[]>([]);
  const provider = Form.useWatch('provider', form);
  const { tableWrapperRef, scrollY } = useTableScrollY([data.list.length, loading, page, pageSize]);

  const loadData = useCallback(() => {
    setLoading(true);
    modelApi
      .list({ page, pageSize, keyword, type })
      .then(setData)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, [keyword, page, pageSize, type]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    ollamaApi.status().then((status) => setOllamaModels(status.models)).catch(() => setOllamaModels([]));
  }, []);

  const open = (mode: ModalMode, model = createModel()) => {
    setCurrent(model);
    setModalMode(mode);
    form.setFieldsValue(model);
  };

  const save = async () => {
    const values = await form.validateFields();
    try {
      if (modalMode === 'create') {
        await modelApi.create(values);
      } else {
        await modelApi.update(current.id, values);
      }
      message.success('模型配置已保存');
      setModalMode(null);
      loadData();
    } catch (error) {
      message.error((error as Error).message);
    }
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

  const importModels = async (file: File) => {
    try {
      const data = await readJsonFile(file);
      const result = await modelApi.importData(data);
      message.success(`成功导入 ${result.imported} 条模型配置`);
      setSelectedRowKeys([]);
      loadData();
    } catch (error) {
      showImportError(error);
    }
  };

  const exportModels = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择需要导出的模型');
      return;
    }
    try {
      const selectedIds = selectedRowKeys.map(String);
      const selectedIdSet = new Set(selectedIds);
      const exportResult = await modelApi.exportData(selectedIds);
      const items = exportResult.items.filter((item) => selectedIdSet.has(item.id));
      if (items.length !== selectedIds.length) {
        message.error('导出数据和选中数据不一致，请刷新列表后重试');
        return;
      }
      const selectedItems = selectedIds
        .map((id) => data.list.find((item) => item.id === id) ?? items.find((item) => item.id === id))
        .filter(Boolean) as ModelRecord[];
      downloadJson(exportSelectionFilename(selectedItems, '模型集合'), { ...exportResult, total: items.length, items });
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const columns: ColumnsType<ModelRecord> = withIndexColumn<ModelRecord>([
    { title: '模型名称', dataIndex: 'name', width: 180, render: (_, item) => <Button type="link" onClick={() => open('detail', item)}>{item.name}</Button> },
    { title: '模型类型', dataIndex: 'type', width: 130 },
    { title: '服务商', dataIndex: 'provider', width: 120 },
    { title: '服务地址', dataIndex: 'baseUrl', width: 260, ellipsis: true },
    { title: 'Model ID', dataIndex: 'modelId', width: 180 },
    { title: '上下文长度', dataIndex: 'contextWindow', width: 120 },
    { title: '最大输出', dataIndex: 'maxOutput', width: 110 },
    { title: '超时(s)', dataIndex: 'timeout', width: 90 },
    { title: '启用', dataIndex: 'enabled', width: 90, render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag> },
    { title: '健康状态', dataIndex: 'healthy', width: 110, render: (value: boolean) => <Tag color={value ? 'green' : 'red'}>{value ? '健康' : '异常'}</Tag> },
    { title: '最近检查', dataIndex: 'checkedAt', width: 180, render: formatDateTimeToSecond },
    {
      title: '操作',
      width: 190,
      render: (_, item) => (
        <Space>
          <Button type="link" onClick={() => open('detail', item)}>查看</Button>
          <Button type="link" onClick={() => open('edit', item)}>编辑</Button>
          <Button type="link" onClick={() => runAction(() => modelApi.check(item.id), '模型检查完成')}>检查</Button>
          <Popconfirm title="确认删除模型？" description={`删除「${item.name}」后 Agent 将不能继续引用该模型。`} onConfirm={() => runAction(() => modelApi.delete(item.id), '模型已删除')} okText="确认" cancelText="取消">
            <Button danger type="link">删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], page, pageSize);

  return (
    <Flex vertical gap={16} style={tablePageStyle}>
      <TableToolbar keyword={keyword} onKeywordChange={(value) => { setKeyword(value); setPage(1); }} onReset={() => { setKeyword(''); setType(undefined); setPage(1); }}>
        <Select allowClear placeholder="模型类型" value={type} onChange={(value) => { setType(value); setPage(1); }} style={{ width: 150 }} options={modelTypes.map((item) => ({ label: item, value: item }))} />
      </TableToolbar>
      <Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('create')}>新增模型</Button>
        <Upload accept=".json" showUploadList={false} beforeUpload={(file) => { void importModels(file); return Upload.LIST_IGNORE; }}>
          <Button icon={<ImportOutlined />}>导入模型</Button>
        </Upload>
        <Button icon={<ExportOutlined />} onClick={exportModels}>导出模型</Button>
        <Button onClick={() => runAction(() => modelApi.syncOllamaDefault(), 'Ollama 默认模型已同步')}>同步 Ollama 默认模型</Button>
        <Button onClick={() => Promise.all(data.list.map((item) => modelApi.check(item.id))).then(() => { message.success('当前页模型检查完成'); loadData(); }).catch((error: Error) => message.error(error.message))}>当前页健康检查</Button>
      </Space>
      <div ref={tableWrapperRef} style={tableCardStyle}>
      <Card style={tableCardInnerStyle} styles={{ body: tableCardBodyStyle }}>
        <Table
          columns={columns}
          dataSource={data.list}
          loading={loading}
          rowKey="id"
          rowSelection={{
            preserveSelectedRowKeys: true,
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          scroll={createTableScroll(scrollY)}
          pagination={{ current: page, pageSize, total: data.total, showSizeChanger: { options: tablePageSizeSelectOptions }, showQuickJumper: true, showTotal: (total) => `共 ${total} 条记录`, pageSizeOptions: tablePageSizeOptions }}
          onChange={(pagination) => {
            setPage(pagination.current ?? 1);
            setPageSize(pagination.pageSize ?? 10);
          }}
        />
      </Card>
      </div>
      <Modal title={modalMode === 'create' ? '新增模型' : modalMode === 'edit' ? '编辑模型' : '模型详情'} open={modalMode !== null} onCancel={() => setModalMode(null)} onOk={save} footer={modalMode === 'detail' ? (_, { CancelBtn }) => <CancelBtn /> : undefined} width={760} okText="保存" cancelText="取消">
        {modalMode === 'detail' ? (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="模型名称">{current.name}</Descriptions.Item>
            <Descriptions.Item label="模型类型">{current.type}</Descriptions.Item>
            <Descriptions.Item label="服务商">{current.provider}</Descriptions.Item>
            <Descriptions.Item label="Model ID">{current.modelId}</Descriptions.Item>
            <Descriptions.Item label="服务地址" span={2}>{current.baseUrl}</Descriptions.Item>
            <Descriptions.Item label="上下文">{current.contextWindow}</Descriptions.Item>
            <Descriptions.Item label="最大输出">{current.maxOutput}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Form form={form} layout="vertical" className="grid-form">
            <Form.Item name="name" label="模型名称" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="type" label="模型类型"><Select options={modelTypes.map((item) => ({ label: item, value: item }))} /></Form.Item>
            <Form.Item name="provider" label="服务商"><Select options={['OpenAI', 'DeepSeek', 'Qwen', 'Ollama', 'LM Studio', '自定义'].map((item) => ({ label: item, value: item }))} /></Form.Item>
            <Form.Item name="baseUrl" label="服务地址"><Input /></Form.Item>
            <Form.Item name="modelId" label="Model ID" rules={[{ required: true }]}>
              {provider === 'Ollama' ? <Select showSearch placeholder="选择本机已安装模型" options={ollamaModels.map((item) => ({ label: item.name, value: item.name }))} /> : <Input />}
            </Form.Item>
            <Form.Item name="contextWindow" label="上下文长度"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="maxOutput" label="最大输出长度"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="timeout" label="超时(s)"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
          </Form>
        )}
      </Modal>
    </Flex>
  );
}
