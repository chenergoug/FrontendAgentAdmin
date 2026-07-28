# Frontend Agent Admin

## macOS 打包

在 macOS 中安装 Node.js 20 或更高版本，然后执行：

```bash
npm ci
npm run package:mac:arm64 # Apple Silicon
npm run package:mac:x64   # Intel Mac
```

如需同时兼容 Intel 与 Apple Silicon，可执行：

```bash
npm run package:mac:universal
```

安装包输出到项目同级的 `FrontendAgentAdminRelease` 目录，同时生成 DMG 与 ZIP。当前配置用于本地测试，未进行 Apple Developer 签名和公证；首次启动时需在 Finder 中右键应用并选择“打开”，或在“系统设置 > 隐私与安全性”中允许启动。

Electron + React + TypeScript + Vite + Ant Design + Node 本地服务。

## Scripts

```bash
npm install
npm run dev
npm run dev:service
npm run dev:electron
npm run build
```

默认地址：

```text
主客户端：http://127.0.0.1:5180
本地服务：http://127.0.0.1:3880/api/health
```
