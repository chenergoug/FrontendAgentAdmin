import { Card, Col, Row, Spin, Statistic, Table, Tag, Typography, message } from 'antd';
import { Column, Line } from '@ant-design/plots';
import { useEffect, useState } from 'react';
import { dashboardApi } from '../api';
import type { DashboardData, ProjectRecord, ProjectStatus, RecoveryRecord } from '../types';
import { withIndexColumn } from '../utils/table';
import { formatDateTimeToSecond } from '../utils/time';

const statusText: Record<ProjectStatus, string> = {
  draft: '草稿',
  ready: '已配置',
  running: '子客户端运行中',
  locked: '配置锁定',
  error: '异常',
};

export function HomePage() {
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    setLoading(true);
    dashboardApi
      .getDashboard()
      .then(setDashboard)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, []);

  if (!dashboard) {
    return <Spin spinning={loading} fullscreen={false} />;
  }

  return (
    <Spin spinning={loading}>
      <div className="page-stack">
        <Row gutter={[16, 16]}>
          <Col span={6}><Card><Statistic title="项目总数" value={dashboard.stats.projectTotal} /></Card></Col>
          <Col span={6}><Card><Statistic title="运行中项目" value={dashboard.stats.runningProjectTotal} /></Card></Col>
          <Col span={6}><Card><Statistic title="启用模型" value={dashboard.stats.enabledModelTotal} /></Card></Col>
          <Col span={6}><Card><Statistic title="待处理异常" value={dashboard.stats.pendingRecoveryTotal} /></Card></Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card title="模型使用量（按周统计）">
              <Line data={dashboard.modelUsage} height={280} xField="day" yField="count" point={{ sizeField: 4 }} />
            </Card>
          </Col>
          <Col span={12}>
            <Card title="当日专属 Agent 使用量">
              <Column data={dashboard.agentUsage} height={280} xField="agent" yField="count" />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card title="最近运行项目">
              <Table
                columns={withIndexColumn<ProjectRecord>([
                  { title: '项目名称', dataIndex: 'name' },
                  { title: '项目形态', dataIndex: 'shape' },
                  { title: '状态', dataIndex: 'status', render: (value: ProjectStatus) => <Tag color={value === 'running' ? 'blue' : 'green'}>{statusText[value]}</Tag> },
                  { title: '更新时间', dataIndex: 'updatedAt', render: formatDateTimeToSecond },
                ])}
                dataSource={dashboard.recentProjects}
                pagination={false}
                rowKey="id"
                size="middle"
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card title="需要处理的异常">
              <Table
                columns={withIndexColumn<RecoveryRecord>([
                  { title: '类型', dataIndex: 'type' },
                  { title: '标题', dataIndex: 'title' },
                  { title: '项目', dataIndex: 'projectName' },
                  { title: '级别', dataIndex: 'severity', render: (value: string) => <Tag color={value === '高' ? 'red' : value === '中' ? 'orange' : 'green'}>{value}</Tag> },
                ])}
                dataSource={dashboard.pendingRecovery}
                locale={{ emptyText: <Typography.Text type="secondary">暂无待处理异常</Typography.Text> }}
                pagination={false}
                rowKey="id"
                size="middle"
              />
            </Card>
          </Col>
        </Row>
      </div>
    </Spin>
  );
}
