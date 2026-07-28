import { Button, Card, Descriptions, Flex, Form, Input, Modal, Select, Space, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { settingApi } from '../api';
import { TableToolbar } from '../components/TableToolbar';
import type { PageResult, SettingRecord } from '../types';
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

type ModalMode = 'edit' | 'detail' | null;

export function SettingsPage() {
  const [form] = Form.useForm<SettingRecord>();
  const [keyword, setKeyword] = useState('');
  const [group, setGroup] = useState<string | undefined>();
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [current, setCurrent] = useState<SettingRecord | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PageResult<SettingRecord>>({ list: [], total: 0, page: 1, pageSize: 10 });
  const { tableWrapperRef, scrollY } = useTableScrollY([data.list.length, loading, page, pageSize]);

  const loadData = useCallback(() => {
    setLoading(true);
    settingApi
      .list({ page, pageSize, keyword, group })
      .then(setData)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, [group, keyword, page, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const groups = useMemo(() => Array.from(new Set(data.list.map((item) => item.group))), [data.list]);

  const open = (mode: ModalMode, setting: SettingRecord) => {
    setCurrent(setting);
    setModalMode(mode);
    form.setFieldsValue(setting);
  };

  const save = async () => {
    if (!current) return;
    const values = await form.validateFields();
    try {
      await settingApi.update(current.id, values);
      message.success('系统配置已保存');
      setModalMode(null);
      loadData();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const columns: ColumnsType<SettingRecord> = withIndexColumn<SettingRecord>([
    { title: '配置分组', dataIndex: 'group', width: 160 },
    { title: '配置名称', dataIndex: 'name', width: 180, render: (_, item) => <Button type="link" onClick={() => open('detail', item)}>{item.name}</Button> },
    { title: '配置值', dataIndex: 'value', width: 220, ellipsis: true },
    { title: '说明', dataIndex: 'description', ellipsis: true },
    { title: '操作', width: 120, render: (_, item) => <Space><Button type="link" onClick={() => open('detail', item)}>查看</Button><Button type="link" onClick={() => open('edit', item)}>编辑</Button></Space> },
  ], page, pageSize);

  return (
    <Flex vertical gap={16} style={tablePageStyle}>
      <TableToolbar keyword={keyword} onKeywordChange={(value) => { setKeyword(value); setPage(1); }} onReset={() => { setKeyword(''); setGroup(undefined); setPage(1); }}>
        <Select allowClear placeholder="配置分组" value={group} onChange={(value) => { setGroup(value); setPage(1); }} style={{ width: 170 }} options={groups.map((item) => ({ label: item, value: item }))} />
      </TableToolbar>
      <div ref={tableWrapperRef} style={tableCardStyle}>
      <Card style={tableCardInnerStyle} styles={{ body: tableCardBodyStyle }}>
        <Table
          columns={columns}
          dataSource={data.list}
          loading={loading}
          rowKey="id"
          scroll={createTableScroll(scrollY)}
          pagination={{ current: page, pageSize, total: data.total, showSizeChanger: { options: tablePageSizeSelectOptions }, showQuickJumper: true, showTotal: (total) => `共 ${total} 条记录`, pageSizeOptions: tablePageSizeOptions }}
          onChange={(pagination) => {
            setPage(pagination.current ?? 1);
            setPageSize(pagination.pageSize ?? 10);
          }}
        />
      </Card>
      </div>
      <Modal title={modalMode === 'edit' ? '编辑系统配置' : '系统配置详情'} open={modalMode !== null} onCancel={() => setModalMode(null)} onOk={save} footer={modalMode === 'detail' ? (_, { CancelBtn }) => <CancelBtn /> : undefined} okText="保存" cancelText="取消">
        {modalMode === 'detail' ? (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="配置分组">{current?.group}</Descriptions.Item>
            <Descriptions.Item label="配置名称">{current?.name}</Descriptions.Item>
            <Descriptions.Item label="配置值">{current?.value}</Descriptions.Item>
            <Descriptions.Item label="说明">{current?.description}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Form form={form} layout="vertical">
            <Form.Item name="group" label="配置分组"><Input disabled /></Form.Item>
            <Form.Item name="name" label="配置名称"><Input disabled /></Form.Item>
            <Form.Item name="value" label="配置值"><Input /></Form.Item>
            <Form.Item name="description" label="说明"><Input.TextArea rows={3} /></Form.Item>
          </Form>
        )}
      </Modal>
    </Flex>
  );
}
