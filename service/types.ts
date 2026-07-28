export type ProjectStatus = 'draft' | 'ready' | 'running' | 'locked' | 'error';
export type RiskLevel = '低' | '中' | '高';
export type RecoveryStatus = '待处理' | '已处理';
export type LogLevel = 'info' | 'warning' | 'error';

export type ProjectRecord = {
  id: string;
  name: string;
  source: '新建' | '导入';
  shape: string;
  deviceType: string;
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
  risk: RiskLevel;
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
  level: LogLevel;
  projectName: string;
  title: string;
  detail: string;
  createdAt: string;
};

export type RecoveryRecord = {
  id: string;
  type: string;
  projectName: string;
  title: string;
  detail: string;
  severity: RiskLevel;
  status: RecoveryStatus;
  createdAt: string;
};

export type JsonMap = Record<string, unknown>;

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
