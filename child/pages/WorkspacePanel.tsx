import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Descriptions, Empty, Input, Row, Space, Spin, Tree, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { projectApi } from '../../src/api';
import type { ProjectFileContent, ProjectFileNode, ProjectRecord } from '../../src/types';
import { formatDateTimeToSecond } from '../../src/utils/time';
import { findFileNode, formatSize, toTreeData } from '../utils/files';

type WorkspacePanelProps = {
  project: ProjectRecord;
};

export function WorkspacePanel({ project }: WorkspacePanelProps) {
  const [tree, setTree] = useState<ProjectFileNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<ProjectFileNode | null>(null);
  const [content, setContent] = useState<ProjectFileContent | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTree = useCallback(() => {
    setLoading(true);
    projectApi
      .fileTree(project.id)
      .then((result) => setTree(result.list))
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, [project.id]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const selectFile = (filePath: string) => {
    const node = findFileNode(tree, filePath);
    setSelectedNode(node);
    setContent(null);
    if (!node || node.type !== 'file') return;

    setLoading(true);
    projectApi
      .fileContent(project.id, node.path)
      .then(setContent)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  };

  return (
    <Row gutter={16} className="child-fill">
      <Col span={7}>
        <Card title="文件树" extra={<Button icon={<ReloadOutlined />} onClick={loadTree} />} className="child-panel-card">
          <Spin spinning={loading}>
            {tree.length > 0 ? (
              <Tree treeData={toTreeData(tree)} defaultExpandAll onSelect={(keys) => selectFile(String(keys[0] ?? ''))} />
            ) : (
              <Empty description="项目路径不存在或目录为空" />
            )}
          </Spin>
        </Card>
      </Col>
      <Col span={17}>
        <Card title="代码预览" className="child-panel-card">
          {content ? (
            <Space direction="vertical" size={12} className="full-width">
              <Descriptions bordered column={3} size="small">
                <Descriptions.Item label="文件">{content.name}</Descriptions.Item>
                <Descriptions.Item label="语言">{content.language}</Descriptions.Item>
                <Descriptions.Item label="大小">{formatSize(content.size)}</Descriptions.Item>
                <Descriptions.Item label="路径" span={2}>
                  {content.path}
                </Descriptions.Item>
                <Descriptions.Item label="修改时间">{formatDateTimeToSecond(content.updatedAt)}</Descriptions.Item>
              </Descriptions>
              <Input.TextArea value={content.content} readOnly autoSize={{ minRows: 18, maxRows: 28 }} />
            </Space>
          ) : selectedNode ? (
            <Empty description="请选择文件查看内容" />
          ) : (
            <Alert
              type="info"
              showIcon
              message="请选择左侧文件"
              description="当前阶段只支持只读预览，不会修改项目文件。"
            />
          )}
        </Card>
      </Col>
    </Row>
  );
}
