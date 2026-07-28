@echo off
set ELECTRON_ACCEPTANCE_BASIC_VALIDATE=1
set RENDERER_URL=http://127.0.0.1:5180
set SERVICE_URL=http://127.0.0.1:3880/api
cd /d D:\ErGou\FrontendAgentAdmin
node_modules\electron\dist\electron.exe dist-electron\main.js
