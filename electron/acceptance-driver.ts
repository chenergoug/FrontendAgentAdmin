import { BrowserWindow } from 'electron';

const compact = (value: string) => value.replace(/\s+/g, '');

async function waitUntil(check: () => Promise<boolean>, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Electron acceptance step timed out');
}

async function hasText(window: BrowserWindow, text: string) {
  return window.webContents.executeJavaScript(`document.body.innerText.replace(/\\s+/g, '').includes(${JSON.stringify(compact(text))})`) as Promise<boolean>;
}

async function clickText(window: BrowserWindow, text: string, selector = 'button,.ant-menu-item,.ant-steps-item') {
  const result = await window.webContents.executeJavaScript(`(() => {
    const target = [...document.querySelectorAll(${JSON.stringify(selector)})].find((element) => element.textContent?.replace(/\\s+/g, '').includes(${JSON.stringify(compact(text))}));
    if (!target) return false;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  })()`);
  if (!result) throw new Error(`Electron acceptance target not found: ${text}`);
}

async function clickAnyText(window: BrowserWindow, texts: string[], selector = 'button') {
  const result = await window.webContents.executeJavaScript(`(() => {
    const expected = ${JSON.stringify(texts.map(compact))};
    const target = [...document.querySelectorAll(${JSON.stringify(selector)})].find((element) => expected.includes(element.textContent?.replace(/\\s+/g, '') ?? ''));
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!result) throw new Error(`Electron acceptance targets not found: ${texts.join(', ')}`);
}

async function fillByLabel(window: BrowserWindow, labelText: string, value: string) {
  const result = await window.webContents.executeJavaScript(`(() => {
    const label = [...document.querySelectorAll('label')].find((element) => element.textContent?.replace(/\\s+/g, '').includes(${JSON.stringify(compact(labelText))}));
    const field = label?.htmlFor ? document.getElementById(label.htmlFor) : label?.parentElement?.querySelector('input,textarea');
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return false;
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!result) throw new Error(`Electron acceptance field not found: ${labelText}`);
}

async function fillInputContaining(window: BrowserWindow, currentText: string, value: string) {
  const result = await window.webContents.executeJavaScript(`(() => {
    const field = [...document.querySelectorAll('input,textarea')].find((element) => element.value?.includes(${JSON.stringify(currentText)}));
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return false;
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!result) throw new Error(`Electron acceptance input not found: ${currentText}`);
}

async function setManualWorkflow(window: BrowserWindow) {
  await window.webContents.executeJavaScript(`(() => { const toggle = document.querySelector('.ant-switch-checked'); if (toggle) toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window })); })()`);
}

async function confirmPopover(window: BrowserWindow) {
  await waitUntil(() => window.webContents.executeJavaScript(`Boolean(document.querySelector('.ant-popconfirm-buttons .ant-btn-primary,.ant-popover-buttons .ant-btn-primary'))`));
  const clicked = await window.webContents.executeJavaScript(`(() => { const button = document.querySelector('.ant-popconfirm-buttons .ant-btn-primary,.ant-popover-buttons .ant-btn-primary'); button?.click(); return Boolean(button); })()`);
  if (!clicked) throw new Error('Electron acceptance confirm button not found');
}

async function runWorkflowStage(window: BrowserWindow, expectedTitle: string) {
  await waitUntil(() => hasText(window, expectedTitle));
  await clickText(window, '执行当前节点', 'button');
  await new Promise((resolve) => setTimeout(resolve, 800));
  await waitUntil(async () => {
    const state = await window.webContents.executeJavaScript(`({ review: [...document.querySelectorAll('.ant-tag')].some((item) => item.textContent?.includes('待确认')), spinning: Boolean(document.querySelector('.ant-spin-spinning')) })`);
    return state.review && !state.spinning;
  }, 300000);
  await clickText(window, '确认并进入下一步', 'button');
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function waitFiveSeconds() {
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

async function runFullWorkflowStage(window: BrowserWindow, title: string, requiresApproval: boolean, nextTitle?: string) {
  await waitUntil(() => hasText(window, title));
  await clickText(window, '执行当前节点', 'button');
  await waitUntil(async () => {
    const state = await window.webContents.executeJavaScript(`({
      review: [...document.querySelectorAll('.ant-card .ant-tag')].some((item) => item.textContent?.includes('待确认')),
      approved: [...document.querySelectorAll('.ant-card .ant-tag')].some((item) => item.textContent?.includes('已完成')),
      spinning: Boolean(document.querySelector('.ant-spin-spinning'))
    })`);
    return !state.spinning && (requiresApproval ? state.review : state.approved);
  }, 300000);
  if (requiresApproval) await clickText(window, '确认并进入下一步', 'button');
  await waitFiveSeconds();
  if (!requiresApproval && nextTitle) await clickText(window, nextTitle, '.ant-steps-item');
}

export async function runBasicAdminFullAcceptance(mainWindow: BrowserWindow) {
  await waitUntil(() => hasText(mainWindow, '项目中心'));
  await clickText(mainWindow, '项目中心', '.ant-menu-item');
  await waitUntil(() => hasText(mainWindow, '新建项目'));
  await clickText(mainWindow, '新建项目', 'button');
  await waitUntil(() => hasText(mainWindow, '项目名称'));
  await fillByLabel(mainWindow, '项目名称', 'XX后台管理 全流程验收');
  await fillByLabel(mainWindow, '项目路径', 'D:\\ErGou\\Projects\\xx-admin-full-workflow');
  await fillByLabel(mainWindow, 'Git 地址', 'https://git.example.com/acceptance/xx-admin.git');
  await fillByLabel(mainWindow, '服务器地址', 'http://127.0.0.1:4280');
  await fillByLabel(mainWindow, '运行命令', 'npm run dev');
  await fillByLabel(mainWindow, '构建命令', 'npm run build');
  await fillByLabel(mainWindow, 'Lint 命令', 'npm run lint');
  await fillByLabel(mainWindow, '测试命令', 'npm test');
  await fillByLabel(mainWindow, '项目介绍', 'XX后台管理系统，提供登录页面、首页工作台与 Node 本地服务。');
  await fillByLabel(mainWindow, '原始需求', '创建 XX 后台管理，需要登录页面与首页，使用 Node 创建服务端；前端登录按钮可点击，账号 admin，密码 123456，登录成功进入首页。');
  await clickText(mainWindow, '保存', '.ant-modal button');
  await waitUntil(async () => BrowserWindow.getAllWindows().length >= 2, 30000);
  const childWindow = BrowserWindow.getAllWindows().find((window) => window !== mainWindow);
  if (!childWindow) throw new Error('Basic admin child window not found');
  await waitUntil(() => hasText(childWindow, '开发流程'));
  await clickText(childWindow, '开发流程', '.ant-menu-item');
  await waitUntil(() => hasText(childWindow, '执行当前节点'));
  await setManualWorkflow(childWindow);
  await runFullWorkflowStage(childWindow, '需求分析', true);
  await runFullWorkflowStage(childWindow, '架构设计', true);
  await runFullWorkflowStage(childWindow, '开发计划', true);
  await clickText(childWindow, '文件变更', '.ant-menu-item');
  await waitUntil(() => hasText(childWindow, '生成文件变更'));
  await fillInputContaining(childWindow, '根据已确认', '生成可运行的 React + TypeScript + Vite + Ant Design XX后台管理项目，必须包含可点击登录页面、登录后首页和 Node 服务端 API，并包含 lint、test、build 脚本。');
  await clickText(childWindow, '生成变更', 'button');
  await waitUntil(() => hasText(childWindow, 'pending'), 30000);
  await clickText(childWindow, '应用所选', 'button');
  await confirmPopover(childWindow);
  await waitUntil(() => hasText(childWindow, 'applied'), 30000);
  await clickText(childWindow, '开发流程', '.ant-menu-item');
  await waitUntil(() => hasText(childWindow, '执行当前节点'));
  await clickText(childWindow, '前端开发', '.ant-steps-item');
  await runFullWorkflowStage(childWindow, '前端开发', true);
  await runFullWorkflowStage(childWindow, '后端开发', true);
  await runFullWorkflowStage(childWindow, '代码审核', false, '调试修复');
  await runFullWorkflowStage(childWindow, '调试修复', false, '测试构建');
  await runFullWorkflowStage(childWindow, '测试构建', false, '交付文档');
  await runFullWorkflowStage(childWindow, '交付文档', false);
  await clickText(childWindow, '构建测试', '.ant-menu-item');
  await waitUntil(() => hasText(childWindow, '一键验证'));
  await clickText(childWindow, '一键验证', 'button');
  await confirmPopover(childWindow);
  await waitUntil(() => hasText(childWindow, '一键验证：success'), 300000);
}

export async function runChildAcceptance(childWindow: BrowserWindow) {
  await waitUntil(() => hasText(childWindow, '开发流程'));
  await clickText(childWindow, '开发流程', '.ant-menu-item');
  await waitUntil(() => hasText(childWindow, '执行当前节点'));
  await setManualWorkflow(childWindow);
  await runWorkflowStage(childWindow, '需求分析');
  await runWorkflowStage(childWindow, '架构设计');
  await runWorkflowStage(childWindow, '开发计划');

  await clickText(childWindow, '文件变更', '.ant-menu-item');
  await waitUntil(() => hasText(childWindow, '生成文件变更'));
  await fillInputContaining(childWindow, '根据已确认', '生成可运行的 React + TypeScript + Vite + Ant Design + Three.js 无人机后台项目。实时监控必须使用 WebGLRenderer、飞行曲线、无人机 Mesh、动画和镜头跟随；包含 package.json、构建测试脚本、九个菜单与 Node 本地 API，文件必须模块化。');
  await clickText(childWindow, '生成变更', 'button');
  await waitUntil(() => hasText(childWindow, 'pending'), 300000);
  await clickText(childWindow, '应用所选', 'button');
  await confirmPopover(childWindow);
  await waitUntil(() => hasText(childWindow, 'applied'), 30000);
}

export async function resumePendingAcceptance(mainWindow: BrowserWindow) {
  await waitUntil(() => hasText(mainWindow, '项目中心'));
  await clickText(mainWindow, '项目中心', '.ant-menu-item');
  await waitUntil(() => hasText(mainWindow, '无人机后台管理 Electron 验收'));
  const opened = await mainWindow.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('tr')].find((item) => item.textContent?.includes('无人机后台管理 Electron 验收'));
    const button = row ? [...row.querySelectorAll('button')].find((item) => item.textContent?.replace(/\\s+/g, '') === '打开') : null;
    button?.click(); return Boolean(button);
  })()`);
  if (!opened) throw new Error('Resume project open button not found');
  await waitUntil(async () => BrowserWindow.getAllWindows().length >= 2, 30000);
  const childWindow = BrowserWindow.getAllWindows().find((window) => window !== mainWindow);
  if (!childWindow) throw new Error('Resume child window not found');
  await waitUntil(() => hasText(childWindow, '文件变更'));
  await clickText(childWindow, '文件变更', '.ant-menu-item');
  await waitUntil(() => hasText(childWindow, 'pending'));
  await clickText(childWindow, '应用所选', 'button');
  await confirmPopover(childWindow);
  await waitUntil(() => hasText(childWindow, 'applied'), 30000);
}

export async function resumeGenerationAcceptance(mainWindow: BrowserWindow) {
  await waitUntil(() => hasText(mainWindow, '项目中心'));
  await clickText(mainWindow, '项目中心', '.ant-menu-item');
  await waitUntil(() => hasText(mainWindow, '无人机后台管理 Electron 验收'));
  const buttonState = await mainWindow.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('tr')].find((item) => item.textContent?.includes('无人机后台管理 Electron 验收'));
    const button = row ? [...row.querySelectorAll('button')].find((item) => ['打开', '关闭'].includes(item.textContent?.replace(/\\s+/g, '') ?? '')) : null;
    const text = button?.textContent?.replace(/\\s+/g, '') ?? '';
    button?.click(); return text;
  })()`);
  if (!buttonState) throw new Error('Generation resume project client button not found');
  if (buttonState === '关闭') {
    await waitUntil(() => mainWindow.webContents.executeJavaScript(`(() => {
      const row = [...document.querySelectorAll('tr')].find((item) => item.textContent?.includes('无人机后台管理 Electron 验收'));
      return Boolean(row && [...row.querySelectorAll('button')].some((item) => item.textContent?.replace(/\\s+/g, '') === '打开'));
    })()`), 30000);
    const reopened = await mainWindow.webContents.executeJavaScript(`(() => {
      const row = [...document.querySelectorAll('tr')].find((item) => item.textContent?.includes('无人机后台管理 Electron 验收'));
      const button = row ? [...row.querySelectorAll('button')].find((item) => item.textContent?.replace(/\\s+/g, '') === '打开') : null;
      button?.click(); return Boolean(button);
    })()`);
    if (!reopened) throw new Error('Generation resume project reopen button not found');
  }
  await waitUntil(async () => BrowserWindow.getAllWindows().length >= 2, 30000);
  const childWindow = BrowserWindow.getAllWindows().find((window) => window !== mainWindow);
  if (!childWindow) throw new Error('Generation resume child window not found');
  await waitUntil(() => hasText(childWindow, '文件变更'));
  await clickText(childWindow, '文件变更', '.ant-menu-item');
  await waitUntil(() => hasText(childWindow, '生成文件变更'));
  await fillInputContaining(childWindow, '根据已确认', '生成可运行的 React + TypeScript + Vite + Ant Design + Three.js 无人机后台项目。实时监控必须使用 WebGLRenderer、飞行曲线、无人机 Mesh、动画和镜头跟随；包含 package.json、构建测试脚本、九个菜单与 Node 本地 API，文件必须模块化。');
  await clickText(childWindow, '生成变更', 'button');
  await waitUntil(() => hasText(childWindow, 'pending'), 30000);
  await clickText(childWindow, '应用所选', 'button');
  await confirmPopover(childWindow);
  await waitUntil(() => hasText(childWindow, 'applied'), 30000);
}

export async function resumeValidationAcceptance(mainWindow: BrowserWindow) {
  await waitUntil(() => hasText(mainWindow, '项目中心'));
  await clickText(mainWindow, '项目中心', '.ant-menu-item');
  await waitUntil(() => hasText(mainWindow, '无人机后台管理 Electron 验收'));
  const state = await mainWindow.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('tr')].find((item) => item.textContent?.includes('无人机后台管理 Electron 验收'));
    const button = row ? [...row.querySelectorAll('button')].find((item) => ['打开', '关闭'].includes(item.textContent?.replace(/\\s+/g, '') ?? '')) : null;
    const text = button?.textContent?.replace(/\\s+/g, '') ?? ''; button?.click(); return text;
  })()`);
  if (!state) throw new Error('Validation project client button not found');
  if (state === '关闭') {
    await waitUntil(() => mainWindow.webContents.executeJavaScript(`(() => { const row=[...document.querySelectorAll('tr')].find((item)=>item.textContent?.includes('无人机后台管理 Electron 验收')); return Boolean(row&&[...row.querySelectorAll('button')].some((item)=>item.textContent?.replace(/\\s+/g,'')==='打开')); })()`), 30000);
    await mainWindow.webContents.executeJavaScript(`(() => { const row=[...document.querySelectorAll('tr')].find((item)=>item.textContent?.includes('无人机后台管理 Electron 验收')); const button=row?[...row.querySelectorAll('button')].find((item)=>item.textContent?.replace(/\\s+/g,'')==='打开'):null; button?.click(); return Boolean(button); })()`);
  }
  await waitUntil(async () => BrowserWindow.getAllWindows().length >= 2, 30000);
  const childWindow = BrowserWindow.getAllWindows().find((window) => window !== mainWindow);
  if (!childWindow) throw new Error('Validation child window not found');
  await waitUntil(() => hasText(childWindow, '构建测试'));
  await clickText(childWindow, '构建测试', '.ant-menu-item');
  await waitUntil(() => hasText(childWindow, '一键验证'));
  await clickText(childWindow, '一键验证', 'button');
  await confirmPopover(childWindow);
  await waitUntil(() => hasText(childWindow, '一键验证：success'), 300000);
}

export async function resumeBasicAdminValidation(mainWindow: BrowserWindow) {
  await waitUntil(() => hasText(mainWindow, '项目中心'));
  await clickText(mainWindow, '项目中心', '.ant-menu-item');
  await waitUntil(() => hasText(mainWindow, 'XX后台管理 全流程验收'));
  const state = await mainWindow.webContents.executeJavaScript(`(() => {
    const row=[...document.querySelectorAll('tr')].find((item)=>item.textContent?.includes('XX后台管理 全流程验收'));
    const button=row?[...row.querySelectorAll('button')].find((item)=>['打开','关闭'].includes(item.textContent?.replace(/\\s+/g,'')??'')):null;
    const text=button?.textContent?.replace(/\\s+/g,'')??'';button?.click();return text;
  })()`);
  if (!state) throw new Error('Basic admin validation project button not found');
  if (state === '关闭') {
    await waitUntil(() => mainWindow.webContents.executeJavaScript(`(() => {const row=[...document.querySelectorAll('tr')].find((item)=>item.textContent?.includes('XX后台管理 全流程验收'));return Boolean(row&&[...row.querySelectorAll('button')].some((item)=>item.textContent?.replace(/\\s+/g,'')==='打开'))})()`), 30000);
    await mainWindow.webContents.executeJavaScript(`(() => {const row=[...document.querySelectorAll('tr')].find((item)=>item.textContent?.includes('XX后台管理 全流程验收'));const button=row?[...row.querySelectorAll('button')].find((item)=>item.textContent?.replace(/\\s+/g,'')==='打开'):null;button?.click();return Boolean(button)})()`);
  }
  await waitUntil(async () => BrowserWindow.getAllWindows().length >= 2, 30000);
  const childWindow=BrowserWindow.getAllWindows().find((window)=>window!==mainWindow);
  if (!childWindow) throw new Error('Basic admin validation child window not found');
  await waitUntil(() => hasText(childWindow, '构建测试'));
  await clickText(childWindow, '构建测试', '.ant-menu-item');
  await waitUntil(() => hasText(childWindow, '一键验证'));
  await clickText(childWindow, '一键验证', 'button');
  await confirmPopover(childWindow);
  await waitUntil(() => hasText(childWindow, '一键验证：success'), 300000);
}

export async function runMainAcceptance(mainWindow: BrowserWindow) {
  await waitUntil(() => hasText(mainWindow, '项目中心'));

  await clickText(mainWindow, '模型配置', '.ant-menu-item');
  await waitUntil(() => hasText(mainWindow, '同步 Ollama 默认模型'));
  await clickText(mainWindow, '同步 Ollama 默认模型', 'button');
  await waitUntil(() => hasText(mainWindow, '本地 Qwen Coder 7B'));

  await clickText(mainWindow, 'Agent 配置', '.ant-menu-item');
  await waitUntil(() => hasText(mainWindow, '初始化默认 Agent'));
  await clickText(mainWindow, '初始化默认 Agent', 'button');
  await waitUntil(() => hasText(mainWindow, '需求分析 Agent'));

  await clickText(mainWindow, '项目中心', '.ant-menu-item');
  await waitUntil(() => hasText(mainWindow, '新建项目'));
  await clickText(mainWindow, '新建项目', 'button');
  await waitUntil(() => hasText(mainWindow, '项目名称'));

  await fillByLabel(mainWindow, '项目名称', '无人机后台管理 Electron 验收');
  await fillByLabel(mainWindow, '项目路径', 'D:\\ErGou\\Projects\\drone-admin-electron-acceptance');
  await fillByLabel(mainWindow, 'Git 地址', 'https://git.example.com/acceptance/drone-admin-electron.git');
  await fillByLabel(mainWindow, '服务器地址', 'http://127.0.0.1:4273');
  await fillByLabel(mainWindow, '运行命令', 'npm run dev');
  await fillByLabel(mainWindow, '构建命令', 'npm run build');
  await fillByLabel(mainWindow, 'Lint 命令', 'npm run lint');
  await fillByLabel(mainWindow, '测试命令', 'npm test');
  await fillByLabel(mainWindow, '项目介绍', '无人机后台管理平台，包含设备、飞行任务、WebGL 实时监控、媒体、告警、报表、RBAC 和系统配置。');
  await fillByLabel(mainWindow, '原始需求', '登录注册；首页；无人机管理；实时监控使用 Three.js WebGL 展示飞行路径、无人机运动和镜头跟随；飞行任务；媒体资源；告警；数据分析；人员权限；系统配置。');
  await clickText(mainWindow, '保存', '.ant-modal button');

  await waitUntil(async () => BrowserWindow.getAllWindows().length >= 2, 30000);
  const childWindow = BrowserWindow.getAllWindows().find((window) => window !== mainWindow) ?? null;
  if (childWindow) await runChildAcceptance(childWindow);
  return childWindow;
}
