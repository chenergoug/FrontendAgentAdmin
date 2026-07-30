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
  serverFramework: string;
  serverRootPath: string;
  serverDevCommand: string;
  serverBuildCommand: string;
  serverTestCommand: string;
  databaseType: string;
  databaseHost: string;
  databasePort: string;
  databaseName: string;
  databaseUsername: string;
  databasePasswordConfigured: boolean;
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
  contextRules: string[];
  outputFormat: string;
  qualityGates: string[];
};

export type AgentConfigurationRequest = {
  mode: 'create' | 'edit';
  agentId?: string;
  draft?: Partial<AgentRecord>;
  task?: string;
  requestId?: number;
};

export type AgentPlanItem = {
  key: string;
  workflowStageKey?: WorkflowStageKey;
  expectedAgentId: string;
  name: string;
  category: string;
  task: string;
  required: boolean;
  available: boolean;
  agent: AgentRecord | null;
  proposedAgent: AgentRecord;
};

export type AgentPlan = {
  projectId: string;
  planning: string;
  summary: string;
  hasFrontend: boolean;
  hasBackend: boolean;
  items: AgentPlanItem[];
  updatedAt: string;
};

export type AgentRunStatus = 'queued' | 'running' | 'success' | 'failed' | 'stopped';

export type AgentRunRecord = {
  id: string;
  projectId: string;
  projectName: string;
  agentId: string;
  agentName: string;
  modelName: string;
  modelId: string;
  status: AgentRunStatus;
  input: string;
  output: string;
  error: string;
  startedAt: string;
  endedAt: string;
};

export type AgentRunLog = {
  id: string;
  runId: string;
  level: LogRecord['level'];
  text: string;
  createdAt: string;
};

export type WorkflowStageKey = 'requirements' | 'architecture' | 'planning' | 'frontend' | 'backend' | 'review' | 'debug' | 'test' | 'docs';
export type WorkflowStageStatus = 'pending' | 'running' | 'review' | 'approved' | 'failed';

export type WorkflowStageRecord = {
  key: WorkflowStageKey;
  title: string;
  agentId: string;
  status: WorkflowStageStatus;
  input: string;
  output: string;
  runId: string;
  error: string;
  requiresApproval: boolean;
  updatedAt: string;
  confirmedAt: string;
};

export type WorkflowSnapshot = {
  id: string;
  version: number;
  projectId: string;
  projectName: string;
  activeStage: WorkflowStageKey;
  autoMode: boolean;
  autoApproveSeconds: number;
  stages: WorkflowStageRecord[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowHistoryRecord = WorkflowSnapshot & {
  historyId: string;
  rerunFrom: WorkflowStageKey;
  rerunReason: string;
  archivedAt: string;
};

export type WorkflowCapability = { stageKey: WorkflowStageKey; agentId: string; available: boolean; reasons: string[] };
export type WorkflowCapabilityReport = { projectId: string; ready: boolean; projectPathAvailable: boolean; stages: WorkflowCapability[] };

export type FileChangeAction = 'create' | 'update' | 'delete';
export type FileChangeSetStatus = 'pending' | 'applied' | 'rejected' | 'failed';
export type FileChangeItem = { path: string; action: FileChangeAction; content: string; originalContent: string; selected: boolean };
export type FileChangeSet = {
  id: string;
  projectId: string;
  projectName: string;
  agentRunId: string;
  summary: string;
  status: FileChangeSetStatus;
  files: FileChangeItem[];
  error: string;
  createdAt: string;
  appliedAt: string;
};

export type OllamaModelTag = {
  name: string;
  model: string;
  modifiedAt: string;
  size: number;
};

export type OllamaStatus = {
  installed: boolean;
  running: boolean;
  version: string;
  baseUrl: string;
  models: OllamaModelTag[];
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

export type ProjectValidationRecord = {
  id: string;
  projectId: string;
  projectName: string;
  status: 'running' | 'success' | 'failed';
  currentStep: ProjectTaskType | '';
  taskIds: string[];
  report: string;
  startedAt: string;
  endedAt: string;
};
