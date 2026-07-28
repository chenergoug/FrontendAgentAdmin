export type MenuKey = 'home' | 'projects' | 'models' | 'agents' | 'settings' | 'logs' | 'recovery';

export type ProjectShape = '纯前端' | '纯后端' | '全栈 Monorepo' | '前后端分离';
export type ProjectDeviceType = 'PC端' | '小程序' | 'Android' | 'iOS' | '移动端' | '桌面端';
export type ProjectStatus = 'draft' | 'ready' | 'running' | 'locked' | 'error';

export type ProjectRecord = {
  id: string;
  name: string;
  source: '新建' | '导入';
  shape: ProjectShape;
  deviceType: ProjectDeviceType;
  businessType: string;
  rootPath: string;
  gitRemote: string;
  branch: string;
  serverUrl: string;
  devCommand: string;
  buildCommand: string;
  lintCommand: string;
  testCommand: string;
  configVersion: number;
  status: ProjectStatus;
  updatedAt: string;
  description: string;
  requirement: string;
};

export type ModelRecord = {
  id: string;
  name: string;
  type: '线上模型' | '本地离线模型';
  provider: string;
  baseUrl: string;
  modelId: string;
  contextWindow: number;
  maxOutput: number;
  timeout: number;
  enabled: boolean;
  healthy: boolean;
  checkedAt: string;
};

export type AgentRecord = {
  id: string;
  name: string;
  category: string;
  modelName: string;
  risk: '低' | '中' | '高';
  enabled: boolean;
  description: string;
  prompt: string;
  permissions: string[];
  approvalRules: string[];
};

export type SettingRecord = {
  id: string;
  group: string;
  name: string;
  value: string;
  description: string;
};

export type LogRecord = {
  id: string;
  type: '系统日志' | '项目日志' | '任务日志' | '模型调用' | '命令日志';
  level: 'info' | 'warning' | 'error';
  projectName: string;
  title: string;
  detail: string;
  createdAt: string;
};

export type RecoveryRecord = {
  id: string;
  type: '异常 Session' | '遗留进程' | '任务锁' | '配置草稿' | '失败任务' | '文件变更' | '日志清理';
  projectName: string;
  title: string;
  detail: string;
  severity: '低' | '中' | '高';
  status: '待处理' | '已处理';
  createdAt: string;
};

export type ModelUsagePoint = {
  day: string;
  count: number;
};

export type AgentUsagePoint = {
  agent: string;
  count: number;
};

export type PageResult<T> = {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type DashboardData = {
  stats: {
    projectTotal: number;
    runningProjectTotal: number;
    enabledModelTotal: number;
    pendingRecoveryTotal: number;
  };
  modelUsage: ModelUsagePoint[];
  agentUsage: AgentUsagePoint[];
  recentProjects: ProjectRecord[];
  pendingRecovery: RecoveryRecord[];
};

export type ProjectFileNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  updatedAt: string;
  children?: ProjectFileNode[];
};

export type ProjectFileContent = {
  path: string;
  name: string;
  size: number;
  updatedAt: string;
  language: string;
  content: string;
};

export type ProjectTaskType = 'dev' | 'build' | 'lint' | 'test';
export type ProjectTaskStatus = 'running' | 'success' | 'failed' | 'stopped';

export type ProjectTaskRecord = {
  id: string;
  projectId: string;
  projectName: string;
  type: ProjectTaskType;
  command: string;
  status: ProjectTaskStatus;
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
};

export type ProjectTaskLog = {
  id: string;
  taskId: string;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
  createdAt: string;
};
