import type { BrowserWindow } from 'electron'

const pollIntervalMs = 200

export class ElectronAutomationDriver {
  constructor(private readonly window: BrowserWindow) {}

  private ensureAvailable() {
    if (this.window.isDestroyed()) throw new Error('自动化目标窗口已关闭')
  }

  async waitForText(text: string, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      this.ensureAvailable()
      const found = await this.window.webContents.executeJavaScript(
        `document.body?.innerText.includes(${JSON.stringify(text)}) ?? false`,
        true,
      )
      if (found) return
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
    throw new Error(`等待界面文字超时：${text}`)
  }

  async hasText(text: string) {
    this.ensureAvailable()
    return this.window.webContents.executeJavaScript(
      `document.body?.innerText.includes(${JSON.stringify(text)}) ?? false`,
      true,
    ) as Promise<boolean>
  }

  async clickButton(text: string) {
    this.ensureAvailable()
    const clicked = await this.window.webContents.executeJavaScript(`(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, '')
      const expected = normalize(${JSON.stringify(text)})
      const button = Array.from(document.querySelectorAll('button')).find((item) => normalize(item.textContent) === expected)
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`, true)
    if (!clicked) throw new Error(`未找到可点击按钮：${text}`)
  }

  async clickProjectAction(projectName: string, action: string) {
    this.ensureAvailable()
    const clicked = await this.window.webContents.executeJavaScript(`(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, '')
      const row = Array.from(document.querySelectorAll('tr')).find((item) => item.textContent?.includes(${JSON.stringify(projectName)}))
      const button = row && Array.from(row.querySelectorAll('button')).find((item) => normalize(item.textContent) === normalize(${JSON.stringify(action)}))
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`, true)
    if (!clicked) throw new Error(`项目“${projectName}”没有可用的“${action}”操作`)
  }

  async hasProjectAction(projectName: string, action: string) {
    this.ensureAvailable()
    return this.window.webContents.executeJavaScript(`(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, '')
      const row = Array.from(document.querySelectorAll('tr')).find((item) => item.textContent?.includes(${JSON.stringify(projectName)}))
      return Boolean(row && Array.from(row.querySelectorAll('button')).some((item) => normalize(item.textContent) === normalize(${JSON.stringify(action)}) && !item.disabled))
    })()`, true) as Promise<boolean>
  }

  async clickMenu(text: string) {
    this.ensureAvailable()
    const clicked = await this.window.webContents.executeJavaScript(`(() => {
      const expected = ${JSON.stringify(text)}
      const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((node) => node.textContent?.includes(expected))
      if (!item) return false
      item.click()
      return true
    })()`, true)
    if (!clicked) throw new Error(`未找到菜单：${text}`)
  }

  async fillById(id: string, value: string) {
    this.ensureAvailable()
    const filled = await this.window.webContents.executeJavaScript(`(() => {
      const input = document.getElementById(${JSON.stringify(id)})
      if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return false
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
      setter?.call(input, ${JSON.stringify(value)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`, true)
    if (!filled) throw new Error(`未找到输入框：${id}`)
  }

  async fillByPlaceholder(placeholder: string, value: string) {
    this.ensureAvailable()
    const filled = await this.window.webContents.executeJavaScript(`(() => {
      const input = Array.from(document.querySelectorAll('input, textarea')).find((item) => item.getAttribute('placeholder') === ${JSON.stringify(placeholder)})
      if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return false
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
      setter?.call(input, ${JSON.stringify(value)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`, true)
    if (!filled) throw new Error(`未找到输入框：${placeholder}`)
  }

  async selectAntOptionById(id: string, optionText: string) {
    this.ensureAvailable()
    const opened = await this.window.webContents.executeJavaScript(`(() => {
      const input = document.getElementById(${JSON.stringify(id)})
      if (!(input instanceof HTMLInputElement)) return false
      input.click()
      return true
    })()`, true)
    if (!opened) throw new Error(`未找到下拉框：${id}`)
    await new Promise((resolve) => setTimeout(resolve, 200))
    const selected = await this.window.webContents.executeJavaScript(`(() => {
      const expected = ${JSON.stringify(optionText)}
      const option = Array.from(document.querySelectorAll('.ant-select-item-option')).find((item) => item.textContent?.includes(expected))
      if (!option) return false
      option.click()
      return true
    })()`, true)
    if (!selected) throw new Error(`下拉框“${id}”中没有选项：${optionText}`)
  }

  async waitForButton(text: string, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      this.ensureAvailable()
      const found = await this.window.webContents.executeJavaScript(`(() => {
        const normalize = (value) => String(value || '').replace(/\\s+/g, '')
        return Array.from(document.querySelectorAll('button')).some((item) => normalize(item.textContent) === normalize(${JSON.stringify(text)}))
      })()`, true)
      if (found) return
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
    throw new Error(`等待按钮超时：${text}`)
  }

  async waitForProjectAction(projectName: string, action: string, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await this.hasProjectAction(projectName, action)) return
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
    throw new Error(`等待项目“${projectName}”的“${action}”操作超时`)
  }

  async waitForSelectorAbsent(selector: string, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      this.ensureAvailable()
      const absent = await this.window.webContents.executeJavaScript(
        `document.querySelector(${JSON.stringify(selector)}) === null`,
        true,
      )
      if (absent) return
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
    throw new Error(`等待界面元素关闭超时：${selector}`)
  }
}
