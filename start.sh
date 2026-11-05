#!/bin/bash

echo "========================================"
echo "  思绪思维导图服务 - 一键启动"
echo "========================================"
echo

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未检测到 Node.js"
    echo
    echo "请先安装 Node.js 22.16 或更高版本"
    echo "下载地址：https://nodejs.org/"
    echo
    read -p "按回车键退出..."
    exit 1
fi

# 获取 Node.js 版本
NODE_VERSION=$(node --version)
echo "✅ Node.js 版本：$NODE_VERSION"

# 检查版本是否 >= 22
MAJOR_VERSION=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
if [ "$MAJOR_VERSION" -lt 22 ]; then
    echo "❌ 错误：Node.js 版本过低（需要 22.16+）"
    echo
    echo "当前版本：$NODE_VERSION"
    echo "请升级 Node.js 到 22.16 或更高版本"
    echo
    read -p "按回车键退出..."
    exit 1
fi

echo
echo "🚀 正在启动服务..."
echo
echo "   服务启动后，请在浏览器访问："
echo "   - 本机：http://localhost:8088"
echo "   - 局域网：http://<本机IP>:8088"
echo
echo "   按 Ctrl+C 停止服务"
echo
echo "========================================"
echo

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 启动服务
cd "$SCRIPT_DIR"
node server/server.mjs

# 如果服务退出，暂停以便查看错误信息
echo
echo "========================================"
echo "  服务已停止"
echo "========================================"
read -p "按回车键退出..."
