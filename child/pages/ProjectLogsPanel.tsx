import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Input, Select, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { logApi } from '../../src/api';
import type { LogRecord, ProjectRecord } from '../../src/types';
import { formatDateTimeToSecond } from '../../src/utils/time';

type ProjectLogsPanelProps = {
  project: ProjectRecord;
};

export function ProjectLogsPanel({ project }: ProjectLogsPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [level, setLevel] = useState<LogRecord['level'] | undefined>();
  const [logs, setLogs] = useState<LogRecord[]>([]);

  const loadLogs = useCallback(() => {
    logApi
      .list({ page: 1, pageSize: 50, keyword, level })
      .then((result) => setLogs(result.list.filter((item) => item.projectName === project.name)))
      .catch((error: Error) => message.error(error.message));
  }, [keyword, level, project.name]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const columns: ColumnsType<LogRecord> = [
    { title: '时间', dataIndex: 'createdAt', width: 170, render: formatDateTimeToSecond },
    { title: '类型', dataIndex: 'type', width: 120 },
    { title: '级别', dataIndex: 'level', width: 100, render: (value) => <Tag>{value}</Tag> },
    { title: '标题', dataIndex: 'title', width: 220 },
    { title: '详情', dataIndex: 'detail', ellipsis: true },
  ];

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Card>
        <Space>
          <Input.Search placeholder="搜索项目日志" value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={loadLogs} style={{ width: 260 }} />
          <Select
            allowClear
            placeholder="级别"
            value={level}
            onChange={(value) => setLevel(value)}
            style={{ width: 140 }}
            options={['info', 'warning', 'error'].map((item) => ({ label: item, value: item }))}
          />
          <Button icon={<ReloadOutlined />} onClick={loadLogs}>
            刷新
          </Button>
        </Space>
      </Card>
      <Card>
        <Table columns={columns} dataSource={logs} rowKey="id" pagination={false} scroll={{ x: 'max-content', y: 520 }} />
      </Card>
    </Space>
  );
}
