import { Button, Card, Descriptions, Flex, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { logApi } from '../api'
import { TableToolbar } from '../components/TableToolbar'
import type { LogRecord, PageResult } from '../types'
import {
  tableCardBodyStyle,
  tableCardInnerStyle,
  tableCardStyle,
  createTableScroll,
  tablePageSizeOptions,
  tablePageSizeSelectOptions,
  tablePageStyle,
  useTableScrollY,
  withIndexColumn
} from '../utils/table'
import { formatDateTimeToSecond } from '../utils/time'

const logTypes: LogRecord['type'][] = ['系统日志', '项目日志', '任务日志', '模型调用', '命令日志']

export function LogsPage() {
  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState<LogRecord['type'] | undefined>()
  const [level, setLevel] = useState<LogRecord['level'] | undefined>()
  const [current, setCurrent] = useState<LogRecord | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PageResult<LogRecord>>({ list: [], total: 0, page: 1, pageSize: 10 })
  const { tableWrapperRef, scrollY } = useTableScrollY([data.list.length, loading, page, pageSize])

  const loadData = useCallback(() => {
    setLoading(true)
    logApi
      .list({ page, pageSize, keyword, type, level })
      .then(setData)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false))
  }, [keyword, level, page, pageSize, type])

  useEffect(() => {
    loadData()
  }, [loadData])

  const columns: ColumnsType<LogRecord> = withIndexColumn<LogRecord>(
    [
      { title: '日志类型', dataIndex: 'type', width: 120 },
      {
        title: '级别',
        dataIndex: 'level',
        width: 100,
        render: (value) => (
          <Tag color={value === 'error' ? 'red' : value === 'warning' ? 'orange' : 'blue'}>{value}</Tag>
        )
      },
      { title: '项目', dataIndex: 'projectName', width: 160 },
      {
        title: '标题',
        dataIndex: 'title',
        width: 220,
        render: (_, item) => (
          <Button type="link" onClick={() => setCurrent(item)}>
            {item.title}
          </Button>
        )
      },
      { title: '详情', dataIndex: 'detail', ellipsis: true },
      { title: '时间', dataIndex: 'createdAt', width: 180, render: formatDateTimeToSecond },
      {
        title: '操作',
        width: 90,
        render: (_, item) => (
          <Button type="link" onClick={() => setCurrent(item)}>
            查看
          </Button>
        )
      }
    ],
    page,
    pageSize
  )

  return (
    <Flex vertical gap={16} style={tablePageStyle}>
      <TableToolbar
        keyword={keyword}
        onKeywordChange={(value) => {
          setKeyword(value)
          setPage(1)
        }}
        onReset={() => {
          setKeyword('')
          setType(undefined)
          setLevel(undefined)
          setPage(1)
        }}>
        <Select
          allowClear
          placeholder="日志类型"
          value={type}
          onChange={(value) => {
            setType(value)
            setPage(1)
          }}
          style={{ width: 150 }}
          options={logTypes.map((item) => ({ label: item, value: item }))}
        />
        <Select
          allowClear
          placeholder="级别"
          value={level}
          onChange={(value) => {
            setLevel(value)
            setPage(1)
          }}
          style={{ width: 120 }}
          options={['info', 'warning', 'error'].map((item) => ({ label: item, value: item }))}
        />
      </TableToolbar>
      <div ref={tableWrapperRef} style={tableCardStyle}>
      <Card style={tableCardInnerStyle} styles={{ body: tableCardBodyStyle }}>
        <Table
          columns={columns}
          dataSource={data.list}
          loading={loading}
          rowKey="id"
          scroll={createTableScroll(scrollY)}
          pagination={{
            current: page,
            pageSize,
            total: data.total,
            showSizeChanger: { options: tablePageSizeSelectOptions },
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            pageSizeOptions: tablePageSizeOptions
          }}
          onChange={(pagination) => {
            setPage(pagination.current ?? 1)
            setPageSize(pagination.pageSize ?? 10)
          }}
        />
      </Card>
      </div>
      <Modal
        title="日志详情"
        open={Boolean(current)}
        onCancel={() => setCurrent(null)}
        footer={(_, { CancelBtn }) => <CancelBtn />}>
        {current && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="类型">{current.type}</Descriptions.Item>
            <Descriptions.Item label="级别">{current.level}</Descriptions.Item>
            <Descriptions.Item label="项目">{current.projectName}</Descriptions.Item>
            <Descriptions.Item label="标题">{current.title}</Descriptions.Item>
            <Descriptions.Item label="详情">{current.detail}</Descriptions.Item>
            <Descriptions.Item label="时间">{formatDateTimeToSecond(current.createdAt)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </Flex>
  )
}
