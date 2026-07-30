export type AcceptanceAutomationConfig = {
  enabled: boolean
  scenario: string
  projectName: string
  projectRoot: string
  projectDescription: string
  projectRequirement: string
  projectConstraints: string
  modelName: string
  databaseName: string
  databaseUsername: string
  databasePassword: string
}

function enabled(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '')
}

export function readAcceptanceAutomationConfig(): AcceptanceAutomationConfig {
  return {
    enabled: enabled(process.env.ELECTRON_ACCEPTANCE_AUTOMATION),
    scenario: process.env.ELECTRON_ACCEPTANCE_SCENARIO?.trim() || 'fullstack-workflow',
    projectName: process.env.ELECTRON_ACCEPTANCE_PROJECT?.trim() || '仓储管理全栈完整验收',
    projectRoot: process.env.ELECTRON_ACCEPTANCE_PROJECT_ROOT?.trim() || 'D:\\FullstackWarehouseAcceptance',
    projectDescription: '用于完整验证 Vue 前端、Node.js 后端、MySQL 数据库、测试数据和九节点 Agent 工作流。',
    projectRequirement: '创建仓储库存后台管理系统。包含登录、首页统计、商品管理、库存预警和最近入库记录；商品管理支持分页查询、新增、编辑、删除并二次确认。前端真实调用后端 REST API，后端使用 Node.js 并连接 MySQL。必须提供幂等的建库建表和测试数据脚本、环境变量示例、接口测试、Lint、构建和运行文档。',
    projectConstraints: '使用 qwen2.5-coder:7b 本地模型；前端采用 Vue 3 + TypeScript + Vite；后端采用 Node.js + Express；数据库仅连接 127.0.0.1:3306；密码不得写入源码；数据库脚本必须幂等；生成结果必须实际运行 Lint、测试和构建。',
    modelName: 'Ollama qwen2.5-coder:7b',
    databaseName: process.env.ELECTRON_ACCEPTANCE_DATABASE?.trim() || 'warehouse_acceptance_v2',
    databaseUsername: process.env.ELECTRON_ACCEPTANCE_DATABASE_USER?.trim() || 'root',
    databasePassword: process.env.ELECTRON_ACCEPTANCE_DATABASE_PASSWORD ?? '',
  }
}
