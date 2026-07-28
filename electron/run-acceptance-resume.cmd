@echo off
set ELECTRON_ACCEPTANCE_RESUME=1
set RENDERER_URL=http://127.0.0.1:5180
set SERVICE_URL=http://127.0.0.1:3880/api
cd /d D:\ErGou\FrontendAgentAdmin
call npm run dev:electron
