@echo off
title 开课啦 - OpenMAIC 一键启动
cd /d D:\Desktop\maic

echo ============================================
echo            OpenMAIC 开课启动器
echo    老师: 缪尔赛思   助教: 阿米娅
echo    同学: 迷迭香  安洁莉娜
echo ============================================
echo.

rem ---------- 1. FunASR 语音识别 (端口 8000) ----------
netstat -ano | findstr /C:":8000" | findstr /C:"LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [跳过] FunASR 语音识别已在运行
) else (
    echo [启动] FunASR 语音识别服务, 新窗口, 模型加载约 20 秒 ...
    start "FunASR语音识别-勿关闭" cmd /k C:\Users\cheny\AppData\Local\Python\pythoncore-3.14-64\Scripts\funasr-server.exe --device cpu --model sensevoice --host 127.0.0.1 --port 8000
)

rem ---------- 1.5 Genie TTS 语音合成 (端口 8001) ----------
netstat -ano | findstr /C:":8001" | findstr /C:"LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [跳过] Genie TTS 语音合成已在运行
) else (
    echo [启动] Genie TTS 语音合成服务, 新窗口, 模型加载约 15 秒 ...
    start "GenieTTS语音合成-勿关闭" cmd /k D:\Desktop\maic\start-genie-tts.cmd
)

rem ---------- 2. OpenMAIC 课堂 (端口 3000) ----------
netstat -ano | findstr /C:":3000" | findstr /C:"LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [跳过] OpenMAIC 已在运行
) else (
    if not exist node_modules (
        echo [初始化] 首次运行, 安装依赖, 仅需一次, 约 5 分钟 ...
        call pnpm install
    )
    echo [启动] OpenMAIC 课堂, 新窗口 ...
    start "OpenMAIC课堂-勿关闭" cmd /k "cd /d D:\Desktop\maic && call pnpm dev"
)

echo.
echo [等待] 服务预热中, 20 秒后自动打开浏览器 ...
timeout /t 20 /nobreak >nul
start "" http://localhost:3000

echo.
echo ============================================
echo  完成! 浏览器已打开 http://localhost:3000
echo  ※ 三个服务窗口请保持开启, 可最小化
echo  ※ 下课 = 关闭那三个窗口即可
echo ============================================
pause
