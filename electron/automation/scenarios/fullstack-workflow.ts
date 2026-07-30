import type { BrowserWindow } from 'electron'
import type { AcceptanceAutomationConfig } from '../config.js'
import { ElectronAutomationDriver } from '../driver.js'

export async function openFullstackProject(mainWindow: BrowserWindow, config: AcceptanceAutomationConfig) {
  const driver = new ElectronAutomationDriver(mainWindow)
  await driver.waitForText('项目中心')
  await driver.clickMenu('项目中心')
  await driver.waitForText(config.projectName)
  if (await driver.hasProjectAction(config.projectName, '关闭')) {
    await driver.clickProjectAction(config.projectName, '关闭')
    await driver.waitForProjectAction(config.projectName, '打开')
  }
  await driver.clickProjectAction(config.projectName, '打开')
}

export async function configureFullstackChild(childWindow: BrowserWindow, config: AcceptanceAutomationConfig) {
  const driver = new ElectronAutomationDriver(childWindow)
  await driver.waitForText('Agent 任务规划', 120000)
  await driver.waitForButton('配置数据库', 120000)
  await driver.clickButton('配置数据库')
  await driver.fillById('databaseHost', '127.0.0.1')
  await driver.fillById('databasePort', '3306')
  await driver.fillById('databaseName', config.databaseName)
  await driver.fillById('databaseUsername', config.databaseUsername)
  await driver.fillById('databasePassword', config.databasePassword)
  await driver.clickButton('保存配置')
  await driver.waitForSelectorAbsent('.ant-modal-content')
  await driver.waitForText('已配置', 30000)
  await driver.clickButton('确认技术选型')
  await driver.waitForText('已确认', 30000)
  await driver.clickMenu('开发流程')
  await driver.waitForButton('执行当前节点', 30000)
  await driver.clickButton('执行当前节点')
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (await driver.hasText('重新执行工作流节点')) {
    await driver.fillByPlaceholder('说明需求变化、修复原因或重新生成目标', '完整全栈回归验收：重新生成并验证前端、后端、MySQL 初始化、测试数据和全部质量门禁。')
    await driver.clickButton('归档并重新执行')
  }
}
