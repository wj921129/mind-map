@echo off
chcp 65001 >nul
title 思绪思维导图服务

echo ========================================
echo   思绪思维导图服务 - 一键启动
echo ========================================
echo.

:: 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误：未检测到 Node.js
    echo.
    echo 请先安装 Node.js 22.16 或更高版本
    echo 下载地址：https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 获取 Node.js 版本
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js 版本：%NODE_VERSION%

:: 检查版本是否 >= 22
for /f "tokens=1 delims=." %%a in ("%NODE_VERSION:~1%") do set MAJOR_VERSION=%%a
if %MAJOR_VERSION% LSS 22 (
    echo ❌ 错误：Node.js 版本过低（需要 22.16+）
    echo.
    echo 当前版本：%NODE_VERSION%
    echo 请升级 Node.js 到 22.16 或更高版本
    echo.
    pause
    exit /b 1
)

echo.
echo 🚀 正在启动服务...
echo.
echo    服务启动后，请在浏览器访问：
echo    - 本机：http://localhost:8088
echo    - 局域网：http://^<本机IP^>:8088
echo.
echo    按 Ctrl+C 停止服务
echo.
echo ========================================
echo.

:: 启动服务
node server/server.mjs

:: 如果服务退出，暂停以便查看错误信息
echo.
echo ========================================
echo   服务已停止
echo ========================================
pause
