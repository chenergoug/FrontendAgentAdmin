import { Button, Card, Descriptions, Flex, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { recoveryApi } from '../api';
import { TableToolbar } from '../components/TableToolbar';
import type { PageResult, RecoveryRecord } from '../types';
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

const recoveryTypes: RecoveryRecord['type'][] = ['异常 Session', '遗留进程', '任务锁', '配置草稿', '失败任务', '文件变更', '日志清理'];

export function RecoveryPage() {
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState<RecoveryRecord['type'] | undefined>();
  const [status, setStatus] = useState<RecoveryRecord['status'] | undefined>();
  const [current, setCurrent] = useState<RecoveryRecord | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PageResult<RecoveryRecord>>({ list: [], total: 0, page: 1, pageSize: 10 });
  const { tableWrapperRef, scrollY } = useTableScrollY([data.list.length, loading, page, pageSize]);

  const loadData = useCallback(() => {
    setLoading(true);
    recoveryApi
      .list({ page, pageSize, keyword, type, status })
      .then(setData)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, [keyword, page, pageSize, status, type]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const runAction = async (action: () => Promise<unknown>, successText: string) => {
    try {
      await action();
      message.success(successText);
      loadData();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const columns: ColumnsType<RecoveryRecord> = withIndexColumn<RecoveryRecord>([
    { title: '类型', dataIndex: 'type', width: 130 },
    { title: '项目', dataIndex: 'projectName', width: 160 },
    { title: '标题', dataIndex: 'title', width: 220, render: (_, item) => <Button type="link" onClick={() => setCurrent(item)}>{item.title}</Button> },
    { title: '详情', dataIndex: 'detail', ellipsis: true },
    { title: '级别', dataIndex: 'severity', width: 100, render: (value) => <Tag color={value === '高' ? 'red' : value === '中' ? 'orange' : 'green'}>{value}</Tag> },
    { title: '状态', dataIndex: 'status', width: 100, render: (value) => <Tag color={value === '待处理' ? 'orange' : 'green'}>{value}</Tag> },
    { title: '时间', dataIndex: 'createdAt', width: 180, render: formatDateTimeToSecond },
    {
      title: '操作',
      width: 180,
      render: (_, item) => (
        <Space>
          <Button type="link" onClick={() => setCurrent(item)}>查看</Button>
          <Popconfirm title="确认处理该异常？" description="处理后状态会标记为已处理。" onConfirm={() => runAction(() => recoveryApi.resolve(item.id), '恢复项已处理')} okText="确认" cancelText="取消">
            <Button type="link" disabled={item.status === '已处理'}>处理</Button>
          </Popconfirm>
          <Popconfirm title="确认删除恢复项？" description={`确认删除「${item.title}」吗？`} onConfirm={() => runAction(() => recoveryApi.delete(item.id), '恢复项已删除')} okText="确认" cancelText="取消">
            <Button danger type="link">删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], page, pageSize);

  return (
    <Flex vertical gap={16} style={tablePageStyle}>
      <TableToolbar keyword={keyword} onKeywordChange={(value) => { setKeyword(value); setPage(1); }} onReset={() => { setKeyword(''); setType(undefined); setStatus(undefined); setPage(1); }}>
        <Select allowClear placeholder="异常类型" value={type} onChange={(value) => { setType(value); setPage(1); }} style={{ width: 150 }} options={recoveryTypes.map((item) => ({ label: item, value: item }))} />
        <Select allowClear placeholder="状态" value={status} onChange={(value) => { setStatus(value); setPage(1); }} style={{ width: 120 }} options={['待处理', '已处理'].map((item) => ({ label: item, value: item }))} />
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
      <Modal title="恢复项详情" open={Boolean(current)} onCancel={() => setCurrent(null)} footer={(_, { CancelBtn }) => <CancelBtn />}>
        {current && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="类型">{current.type}</Descriptions.Item>
            <Descriptions.Item label="项目">{current.projectName}</Descriptions.Item>
            <Descriptions.Item label="标题">{current.title}</Descriptions.Item>
            <Descriptions.Item label="详情">{current.detail}</Descriptions.Item>
            <Descriptions.Item label="级别">{current.severity}</Descriptions.Item>
            <Descriptions.Item label="状态">{current.status}</Descriptions.Item>
            <Descriptions.Item label="时间">{formatDateTimeToSecond(current.createdAt)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </Flex>
  );
}
