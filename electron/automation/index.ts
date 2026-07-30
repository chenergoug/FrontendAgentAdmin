import type { BrowserWindow } from 'electron'
import { readAcceptanceAutomationConfig } from './config.js'
import { configureFullstackChild, openFullstackProject } from './scenarios/fullstack-workflow.js'

const config = readAcceptanceAutomationConfig()

function report(scope: string, error: unknown) {
  const detail = error instanceof Error ? error.stack || error.message : String(error)
  console.error(`[acceptance-automation:${scope}] ${detail}`)
}

export function acceptanceAutomationEnabled() {
  return config.enabled
}

export function runMainAcceptanceAutomation(window: BrowserWindow) {
  if (!config.enabled) return
  if (config.scenario !== 'fullstack-workflow') {
    report('main', new Error(`未知验收场景：${config.scenario}`))
    return
  }
  void openFullstackProject(window, config).catch((error) => report('main', error))
}

export function runChildAcceptanceAutomation(window: BrowserWindow) {
  if (!config.enabled) return
  void configureFullstackChild(window, config).catch((error) => report('child', error))
}
