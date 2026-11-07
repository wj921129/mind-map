#!/usr/bin/env node

/**
 * MCP Stdio Server — 思维导图工具集
 * 标准 JSON-RPC 2.0 over stdio（零第三方依赖）
 *
 * 启动方式：node server/mcp.mjs
 * 所有调试日志输出至 stderr，严禁污染 stdout
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_SCRIPT = join(__dirname, 'server.mjs')
const SERVER_URL = 'http://localhost:8088'

// ─── 工具 Schema 定义（与原 simple-mind-map-mcp 100% 兼容） ───

const TOOLS = [
  {
    name: 'start_editor',
    description: '打开思维导图编辑器页面。默认用系统浏览器打开；若 agent 支持内置浏览器（如 browser-use），可传 skipBrowserOpen=true 跳过系统浏览器，然后手动导航到返回的 url。',
    inputSchema: {
      type: 'object',
      properties: {
        skipBrowserOpen: { type: 'boolean', description: '跳过自动打开系统浏览器，适用于 agent 使用内置浏览器的场景' }
      },
      required: null
    }
  },
  {
    name: 'set_mind_map_data',
    description:
      '设置思维导图数据。参数：data（Markdown 格式字符串，必填）、layout（结构，可选，可选值包括 logicalStructure、mindMap、organizationStructure、catalogOrganization、timeline、verticalTimeline、fishbone、flowchart（树状分叉流程图：多分支自动渲染为菱形判断框，条件直接挂在连接线上，推荐用于业务/代码流程图）、flowchart2（树状分叉流程图2：统一矩形紧凑框）等）、theme（主题，可选）。编写 flowchart 的 Markdown 时必须采用父子嵌套树结构，硬性要求：①判断步骤作为父节点，其下每个条件写一层，条件下面再挂下游分支步骤；②线性调用链（如 入口→Service→Mapper→返回）必须逐层缩进嵌套、每层一步，严禁写成同一层平铺列表——flowchart 布局中平铺即并行分支，顺序调用链写成平铺会被渲染成横向并列；③也可以在步骤文字前加【条件】前缀（如「【days == 3】4. 校验提现属性」），渲染时会自动拆成条件框 + 步骤节点。嵌套列表示例（每层缩进2空格）：\n- 入口：POST /todo/queryMore\n  - PageHelper.startPage 开启分页\n    - Mapper.selectMore(isDeal, mchntCd)\n平铺反例（禁止）：\n- 入口\n- PageHelper\n- Mapper。若返回结果中带 warnings 字段，说明检测到疑似平铺的调用链，请按提示改写 Markdown 后重新调用本工具。',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: '思维导图数据（Markdown 格式）' },
        layout: { type: 'string', description: '思维导图结构' },
        theme: { type: 'string', description: '思维导图主题' }
      },
      required: ['data']
    }
  },
  {
    name: 'set_mind_map_layout',
    description:
      '修改思维导图结构。参数：layout（结构）。可选值：logicalStructure、mindMap、organizationStructure、catalogOrganization、timeline、verticalTimeline、fishbone、flowchart（树状分叉流程图：多分支自动渲染为菱形判断框，条件直接挂在连接线上）、flowchart2（树状分叉流程图2：统一矩形紧凑框）等。',
    inputSchema: {
      type: 'object',
      properties: {
        layout: { type: 'string', description: '思维导图结构' }
      },
      required: ['layout']
    }
  },
  {
    name: 'set_mind_map_theme',
    description: '修改思维导图样式主题。参数：theme（主题名）。可选值包括：avocado、skyGreen、classicBlue、freshGreen 等。',
    inputSchema: {
      type: 'object',
      properties: {
        theme: { type: 'string', description: '思维导图样式主题' }
      },
      required: ['theme']
    }
  },
  {
    name: 'export_mind_map_to',
    description: '导出思维导图为指定类型文件。参数：exportType（必填，可选 png/svg/pdf/md/xmind/txt/xlsx）、saveFolder（可选，本地绝对路径）。',
    inputSchema: {
      type: 'object',
      properties: {
        exportType: { type: 'string', description: '导出文件类型' },
        saveFolder: { type: 'string', description: '导出文件保存目录（绝对路径）' }
      },
      required: ['exportType']
    }
  },
  {
    name: 'close_editor',
    description: '关闭当前打开的思维导图编辑页面。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: null
    }
  }
]

// ─── :8088 服务自动保活 ───

let serverProcess = null

function log (msg) {
  process.stderr.write(`[MCP] ${msg}\n`)
}

async function isServerRunning () {
  try {
    const res = await fetch(`${SERVER_URL}/api/maps`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

async function ensureServerRunning () {
  if (await isServerRunning()) return true
  log(':8088 服务未运行，正在自动启动...')
  try {
    serverProcess = spawn(process.execPath, [SERVER_SCRIPT], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    serverProcess.unref()
  } catch (e) {
    log(`启动服务进程失败: ${e.message}`)
    return false
  }
  // 轮询等待就绪（最长 5s）
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 200))
    if (await isServerRunning()) {
      log(':8088 服务已就绪')
      return true
    }
  }
  log(':8088 服务启动超时')
  return false
}

// ─── 转发工具调用到 :8088 HTTP API ───

async function forwardToServer (tool, args) {
  const res = await fetch(`${SERVER_URL}/api/mcp/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args })
  })
  return await res.json()
}

// ─── JSON-RPC 2.0 消息处理 ───

function handleJsonRpc (msg) {
  // 请求（有 method 字段）
  if (msg.method && msg.id !== undefined && msg.id !== null) {
    handleRequest(msg)
    return
  }
  // 通知（有 method 但无 id）— 忽略
  if (msg.method) return
  // 响应（有 id 和 result/error）— 客户端不应发送，忽略
}

async function handleRequest (msg) {
  const { id, method, params } = msg

  function sendResult (result) {
    const resp = { jsonrpc: '2.0', id, result }
    process.stdout.write(JSON.stringify(resp) + '\n')
  }

  function sendError (code, message, data) {
    const resp = { jsonrpc: '2.0', id, error: { code, message, data } }
    process.stdout.write(JSON.stringify(resp) + '\n')
  }

  try {
    switch (method) {
      case 'initialize':
        sendResult({
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'simple-mind-map', version: '3.0.0' }
        })
        break

      case 'notifications/initialized':
        // 通知，无需响应
        break

      case 'tools/list':
        sendResult({ tools: TOOLS })
        break

      case 'tools/call': {
        const toolName = params?.name
        const toolArgs = params?.arguments || {}

        if (!toolName) {
          sendError(-32602, '缺少工具名称')
          return
        }

        const tool = TOOLS.find(t => t.name === toolName)
        if (!tool) {
          sendError(-32602, `未知工具: ${toolName}`)
          return
        }

        // 确保 :8088 服务正在运行
        const ok = await ensureServerRunning()
        if (!ok) {
          sendError(-32603, ':8088 服务启动失败，请手动启动: node server/server.mjs')
          return
        }

        // 转发到 :8088 服务端处理
        const result = await forwardToServer(toolName, toolArgs)
        sendResult({
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        })
        break
      }

      default:
        sendError(-32601, `方法不存在: ${method}`)
    }
  } catch (e) {
    log(`处理请求异常: ${e.message}`)
    sendError(-32603, `内部错误: ${e.message}`)
  }
}

// ─── Stdin 逐行读取 JSON-RPC 报文 ───

let buffer = ''

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let newlineIndex
  while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex).trim()
    buffer = buffer.slice(newlineIndex + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      handleJsonRpc(msg)
    } catch (e) {
      log(`JSON 解析失败: ${e.message}, 原始行: ${line.slice(0, 200)}`)
    }
  }
})

process.stdin.on('end', () => {
  log('stdin 已关闭，MCP 进程退出')
  process.exit(0)
})

log('MCP Stdio Server 已就绪 (v3.0)')
