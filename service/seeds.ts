import type { AgentRecord, LogRecord, ModelRecord, ProjectRecord, RecoveryRecord, SettingRecord } from './types.js';

export const seedProjects: ProjectRecord[] = [];
export const seedModels: ModelRecord[] = [];
export const seedAgents: AgentRecord[] = [];
export const seedRecovery: RecoveryRecord[] = [];
export const seedModelUsage: { day: string; count: number }[] = [];
export const seedAgentUsage: { agent: string; count: number }[] = [];
export const seedLogs: LogRecord[] = [];

export function createSeedSettings(dataDir: string): SettingRecord[] {
  return [
    {
      id: 's1',
      group: '数据目录',
      name: '默认数据目录',
      value: dataDir,
      description: '保存系统配置、项目配置、Agent 配置和本地日志。',
    },
    {
      id: 's2',
      group: '子客户端限制',
      name: '单项目子客户端数量',
      value: '1',
      description: '同一个项目同一时间只能打开一个子客户端。',
    },
    {
      id: 's3',
      group: '代码写入策略',
      name: '写入前生成 Diff',
      value: '开启',
      description: '所有代码修改必须先生成 Diff。',
    },
    {
      id: 's4',
      group: '命令执行策略',
      name: '安装依赖审批',
      value: '开启',
      description: '安装依赖必须用户确认。',
    },
    {
      id: 's5',
      group: '上下文策略',
      name: '上下文预算',
      value: '24000 tokens',
      description: '离线模型调用前按预算裁剪上下文。',
    },
    {
      id: 's6',
      group: '日志与快照',
      name: '日志保留',
      value: '30 天',
      description: '过期日志由恢复中心清理。',
    },
  ];
}
