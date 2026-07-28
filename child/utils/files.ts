import type { DataNode } from 'antd/es/tree';
import type { ProjectFileNode } from '../../src/types';

export function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function toTreeData(nodes: ProjectFileNode[]): DataNode[] {
  return nodes.map((node) => ({
    key: node.path || '.',
    title: node.name || '.',
    isLeaf: node.type === 'file',
    children: node.children ? toTreeData(node.children) : undefined,
  }));
}

export function findFileNode(nodes: ProjectFileNode[], filePath: string): ProjectFileNode | null {
  for (const node of nodes) {
    if (node.path === filePath) return node;
    const child = node.children ? findFileNode(node.children, filePath) : null;
    if (child) return child;
  }
  return null;
}
