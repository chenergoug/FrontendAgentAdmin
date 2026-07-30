export type AcceptanceAutomationConfig = {
  enabled: boolean
  scenario: string
  projectName: string
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
    projectName: process.env.ELECTRON_ACCEPTANCE_PROJECT?.trim() || '全栈库存管理验收',
    databaseName: process.env.ELECTRON_ACCEPTANCE_DATABASE?.trim() || 'inventory_acceptance',
    databaseUsername: process.env.ELECTRON_ACCEPTANCE_DATABASE_USER?.trim() || 'root',
    databasePassword: process.env.ELECTRON_ACCEPTANCE_DATABASE_PASSWORD ?? '',
  }
}
