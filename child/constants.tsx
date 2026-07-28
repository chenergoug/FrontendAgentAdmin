import {
  CodeOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  SolutionOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { ProjectRecord, ProjectStatus } from '../src/types';
import type { ChildMenuKey } from './types';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:3880/api';
export const projectClientEventKey = 'frontend-agent-project-client-event';

export const statusText: Record<ProjectStatus, string> = {
  draft: '草稿',
  ready: '已配置',
  running: '子客户端运行中',
  locked: '配置锁定',
  error: '异常',
};

export const statusColor: Record<ProjectStatus, string> = {
  draft: 'gold',
  ready: 'green',
  running: 'blue',
  locked: 'orange',
  error: 'red',
};

export const menuItems: { key: ChildMenuKey; label: string; icon: ReactNode }[] = [
  { key: 'workspace', label: '开发工作区', icon: <CodeOutlined /> },
  { key: 'tasks', label: 'Agent 任务', icon: <RobotOutlined /> },
  { key: 'workflow', label: '开发流程', icon: <SolutionOutlined /> },
  { key: 'changes', label: '文件变更', icon: <FileSearchOutlined /> },
  { key: 'runtime', label: '运行调试', icon: <PlayCircleOutlined /> },
  { key: 'build', label: '构建测试', icon: <ToolOutlined /> },
  { key: 'logs', label: '项目日志', icon: <HistoryOutlined /> },
];

export const emptyProject: ProjectRecord = {
  id: '',
  name: '',
  source: '新建',
  shape: '纯前端',
  deviceType: 'PC端',
  businessType: '',
  rootPath: '',
  gitRemote: '',
  branch: '',
  serverUrl: '',
  devCommand: '',
  buildCommand: '',
  lintCommand: '',
  testCommand: '',
  configVersion: 0,
  status: 'ready',
  updatedAt: '',
  description: '',
  requirement: '',
};
