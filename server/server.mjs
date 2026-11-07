import { createServer } from 'node:http'
import { readFileSync, existsSync, writeFileSync, mkdirSync as fsMkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import {
  createMap,
  getMap,
  listMaps,
  updateMap,
  deleteMap,
  renameMap,
  createVersion,
  listVersions,
  getVersion,
  getLastVersion,
  createShare,
  getShare,
  revokeShare,
  DEFAULT_DATA
} from './db.mjs'

import { randomBytes, createHash } from 'node:crypto'
import {
  generateId,
  generateToken,
  readJsonBody,
  sendJson,
  sendHtml,
  send404,
  send400,
  send409,
  matchRoute,
  getLanIp
} from './utils.mjs'

import { buildEditHostHtml, buildViewHostHtml } from './templates.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '..')
const PUBLIC_DIR = join(__dirname, 'public')
const DIST_DIR = join(ROOT_DIR, 'dist')

const PORT = parseInt(process.env.PORT || '8088', 10)
const HOST = process.env.HOST || '0.0.0.0'

// 版本快照间隔（毫秒）：距离上次快照超过此时间且内容变更时自动归档
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000

// ─── 同端口 WebSocket 内部状态 ───
let activeMcpMapId = null
const wsClients = [] // { socket, mapId, alive }
const pendingExports = new Map() // reqId -> { resolve, timer }

// 服务端默认导图数据
const MCP_DEFAULT_DATA = {
  root: { data: { text: '根节点' }, children: [] },
  theme: { template: 'avocado', config: {} },
  layout: 'logicalStructure',
  config: {},
  view: null
}

// ─── 服务端 Markdown 解析器 ───

// 线性调用链步骤的文本特征：入口/服务调用/Mapper/分页/返回
const CHAIN_STEP_PAT = /(入口[:：]|Service\.|Mapper\.|PageHelper|\.select|\.query|\.insert|\.update|返回|构建分页响应)/
// richText 的 data.text 可能是 HTML，剥标签后用于模式匹配与告警展示
const stripHtml = text => String(text || '').replace(/<[^>]*>/g, '')

// 结构体检：检测疑似被写成平铺列表的线性调用链。
// flowchart 布局中 children 是并行分支，顺序执行的调用链必须是逐层嵌套的父子关系；
// 若组节点下多个平铺叶节点命中调用链特征，则告警（不自动改写，判断权交给 AI/人）
function detectFlatChain (root) {
  const warnings = []
  const walk = node => {
    const kids = node.children || []
    if (kids.length >= 3) {
      const flatChainSteps = kids.filter(
        k => (k.children || []).length === 0 && CHAIN_STEP_PAT.test(stripHtml(k.data && k.data.text))
      )
      if (flatChainSteps.length >= 3) {
        const parentText = stripHtml(node.data && node.data.text).slice(0, 20)
        const stepsText = flatChainSteps.map(k => stripHtml(k.data.text).slice(0, 14)).join(' → ')
        warnings.push(
          `节点「${parentText}」下有 ${flatChainSteps.length} 个平铺步骤（${stepsText}），` +
          '疑似线性调用链被写成了平铺列表；flowchart 布局中平铺即并行分支，' +
          '顺序执行的调用链请改为逐层缩进嵌套（每层一步）后重新生成'
        )
      }
    }
    kids.forEach(walk)
  }
  walk(root)
  return warnings
}

function parseMarkdownToRoot (md) {
  if (!md || !md.trim()) return null
  const lines = md.split(/\r?\n/)
  const root = { data: { text: '中心主题' }, children: [] }
  const stack = [{ node: root, depth: -1 }]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) continue

    let depth = -1
    let text = ''

    const hMatch = line.match(/^(#{1,6})\s+(.*)/)
    if (hMatch) {
      depth = hMatch[1].length - 1
      text = hMatch[2].replace(/[*_`]/g, '').trim()
    } else {
      let lMatch = line.match(/^(\s*)[\-\*\+]\s+(.*)/)
      if (!lMatch) lMatch = line.match(/^(\s*)\d+\.\s+(.*)/)
      if (lMatch) {
        const indent = lMatch[1].length
        depth = Math.floor(indent / 2) + 1
        text = lMatch[2].replace(/[*_`]/g, '').trim()
      }
    }
    if (depth < 0 || !text) continue

    const node = { data: { text }, children: [] }

    if (depth > stack[stack.length - 1].depth) {
      stack[stack.length - 1].node.children.push(node)
    } else if (depth === stack[stack.length - 1].depth) {
      stack.pop()
      stack[stack.length - 1].node.children.push(node)
    } else {
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop()
      }
      stack[stack.length - 1].node.children.push(node)
    }
    stack.push({ node, depth })
  }

  return root.children[0] || root
}

// ─── WebSocket 帧编解码 ───

function decodeWsFrame (buffer) {
  if (buffer.length < 2) return null
  const firstByte = buffer[0]
  const secondByte = buffer[1]
  const fin = (firstByte & 0x80) !== 0
  const opcode = firstByte & 0x0F
  const masked = (secondByte & 0x80) !== 0
  let payloadLength = secondByte & 0x7F
  let offset = 2

  if (payloadLength === 126) {
    if (buffer.length < 4) return null
    payloadLength = buffer.readUInt16BE(2)
    offset = 4
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null
    payloadLength = Number(buffer.readBigUInt64BE(2))
    offset = 10
  }

  let maskKey = null
  if (masked) {
    if (buffer.length < offset + 4) return null
    maskKey = buffer.subarray(offset, offset + 4)
    offset += 4
  }

  if (buffer.length < offset + payloadLength) return null

  let payload = Buffer.allocUnsafe(payloadLength)
  buffer.copy(payload, 0, offset, offset + payloadLength)

  if (maskKey) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskKey[i % 4]
    }
  }

  return { fin, opcode, payload, totalLength: offset + payloadLength }
}

function encodeWsFrame (data) {
  const payload = Buffer.from(data, 'utf8')
  const len = payload.length
  let headerLen = 2
  if (len >= 126 && len <= 65535) headerLen = 4
  else if (len > 65535) headerLen = 10

  const frame = Buffer.allocUnsafe(headerLen + len)
  frame[0] = 0x81 // FIN + text opcode

  if (len < 126) {
    frame[1] = len
  } else if (len <= 65535) {
    frame[1] = 126
    frame.writeUInt16BE(len, 2)
  } else {
    frame[1] = 127
    frame.writeBigUInt64BE(BigInt(len), 2)
  }

  payload.copy(frame, headerLen)
  return frame
}

function encodeWsClose (code = 1000, reason = '') {
  const reasonBuf = Buffer.from(reason, 'utf8')
  const frame = Buffer.allocUnsafe(2 + 2 + reasonBuf.length)
  frame[0] = 0x88 // FIN + close
  frame[1] = 2 + reasonBuf.length
  frame.writeUInt16BE(code, 2)
  reasonBuf.copy(frame, 4)
  return frame
}

function encodeWsPong (payload) {
  const len = payload.length
  let headerLen = 2
  if (len >= 126 && len <= 65535) headerLen = 4
  else if (len > 65535) headerLen = 10

  const frame = Buffer.allocUnsafe(headerLen + len)
  frame[0] = 0x8A // FIN + pong
  if (len < 126) {
    frame[1] = len
  } else if (len <= 65535) {
    frame[1] = 126
    frame.writeUInt16BE(len, 2)
  } else {
    frame[1] = 127
    frame.writeBigUInt64BE(BigInt(len), 2)
  }
  payload.copy(frame, headerLen)
  return frame
}

function isWsOpen (socket) {
  return Boolean(socket && socket.readyState === 'open' && !socket.destroyed && socket.writable)
}

function wsSend (socket, data) {
  if (!isWsOpen(socket)) return false // net.Socket.readyState === 'open'
  try {
    socket.write(encodeWsFrame(data))
    return true
  } catch { return false }
}

function broadcastToMap (mapId, msg) {
  const data = JSON.stringify(msg)
  for (const client of wsClients) {
    if (client.mapId === mapId && isWsOpen(client.socket)) {
      wsSend(client.socket, data)
    }
  }
}

function handleWsUpgrade (req, socket, head) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname !== '/ws/mcp') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }

  const key = req.headers['sec-websocket-key']
  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    socket.destroy()
    return
  }

  const acceptKey = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64')

  const mapId = url.searchParams.get('mapId') || null

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '', ''
  ].join('\r\n')
  socket.write(headers)

  const client = { socket, mapId, alive: true, fragments: [] }
  wsClients.push(client)
  if (mapId) activeMcpMapId = mapId

  log(`[WS] 客户端已连接 mapId=${mapId}，当前 ${wsClients.length} 个连接`)

  const pingInterval = setInterval(() => {
    if (!client.alive) { clearInterval(pingInterval); return }
    client.alive = false
    // 发送 Ping 帧
    try { socket.write(Buffer.from([0x89, 0x00])) } catch {}
  }, 30000)

  socket.on('data', (chunk) => {
    // 将新 chunk 追加到缓冲区
    if (!client._buf) client._buf = Buffer.alloc(0)
    client._buf = Buffer.concat([client._buf, chunk])

    while (client._buf && client._buf.length > 0) {
      const frame = decodeWsFrame(client._buf)
      if (!frame) break

      client._buf = client._buf.subarray(frame.totalLength)
      client.alive = true

      const { fin, opcode, payload } = frame

      // Close 帧
      if (opcode === 0x08) {
        try { socket.write(encodeWsClose(1000)) } catch {}
        clearInterval(pingInterval)
        socket.destroy()
        return
      }
      // Ping → Pong
      if (opcode === 0x09) {
        try { socket.write(encodeWsPong(payload)) } catch {}
        continue
      }
      // Pong
      if (opcode === 0x0A) continue

      // 数据帧（处理分片）
      if (fin) {
        if (client.fragments.length > 0) {
          client.fragments.push(payload)
          const fullMessage = Buffer.concat(client.fragments)
          client.fragments = []
          handleClientMessage(client, fullMessage.toString('utf8'))
        } else {
          handleClientMessage(client, payload.toString('utf8'))
        }
      } else {
        client.fragments.push(payload)
      }
    }
  })

  socket.on('close', () => {
    clearInterval(pingInterval)
    const idx = wsClients.indexOf(client)
    if (idx >= 0) wsClients.splice(idx, 1)
    log(`[WS] 客户端断开 mapId=${mapId}，剩余 ${wsClients.length} 个连接`)
  })

  socket.on('error', (err) => {
    log(`[WS] socket 错误: ${err.message}`)
    clearInterval(pingInterval)
  })
}

function handleClientMessage (client, raw) {
  let msg
  try { msg = JSON.parse(raw) } catch { return }

  // 导出回传
  if (msg.type === 'export_mind_map_to' && msg.id) {
    const pending = pendingExports.get(msg.id)
    if (pending) {
      clearTimeout(pending.timer)
      pendingExports.delete(msg.id)
      pending.resolve(msg)
    }
    return
  }

  // 更新 mapId
  if (msg.type === 'update_mapId' && msg.mapId) {
    client.mapId = msg.mapId
    activeMcpMapId = msg.mapId
  }

  // 前端 keepalive 心跳：client.alive 已在数据帧处理中重置，此处无需额外操作
}

function log (msg) {
  console.log(msg)
}

// MIME 类型映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8'
}

// 静态文件服务
function serveStatic (res, filePath) {
  if (!existsSync(filePath)) {
    send404(res)
    return
  }
  const ext = extname(filePath)
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'
  const content = readFileSync(filePath)
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length
  })
  res.end(content)
}

// 判断是否需要自动归档版本
function shouldArchiveVersion (mapId, newData) {
  const lastVersion = getLastVersion(mapId)
  if (!lastVersion) return true
  const elapsed = Date.now() - new Date(lastVersion.created_at).getTime()
  if (elapsed < SNAPSHOT_INTERVAL_MS) return false
  // 内容变更检查
  return JSON.stringify(lastVersion.data) !== JSON.stringify(newData)
}

// 路由处理
async function handleRequest (req, res) {
  const { method, url } = req
  const [pathname, query] = url.split('?')

  // CORS 头（局域网内可选）
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // 静态资源 /dist/*
  if (pathname.startsWith('/dist/')) {
    const filePath = join(DIST_DIR, pathname.slice(6))
    serveStatic(res, filePath)
    return
  }

  // 列表页 /
  if (method === 'GET' && pathname === '/') {
    serveStatic(res, join(PUBLIC_DIR, 'list.html'))
    return
  }

  // 编辑页 /e/:id
  let params = matchRoute(method, pathname, 'GET', '/e/:id')
  if (params) {
    const map = getMap(params.id)
    if (!map) {
      send404(res, '导图不存在')
      return
    }
    const html = buildEditHostHtml({ mapId: map.id, title: map.title })
    sendHtml(res, 200, html)
    return
  }

  // 只读页 /v/:token
  params = matchRoute(method, pathname, 'GET', '/v/:token')
  if (params) {
    const share = getShare(params.token)
    if (!share || share.revoked) {
      send404(res, '分享链接无效或已吊销')
      return
    }
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      send404(res, '分享链接已过期')
      return
    }
    const map = getMap(share.mapId)
    if (!map) {
      send404(res, '导图不存在')
      return
    }
    const html = buildViewHostHtml({ token: params.token, title: map.title })
    sendHtml(res, 200, html)
    return
  }

  // API 路由
  if (pathname.startsWith('/api/')) {
    await handleApi(req, res, method, pathname)
    return
  }

  send404(res)
}

// API 处理
async function handleApi (req, res, method, pathname) {
  try {
    // GET /api/maps
    if (method === 'GET' && pathname === '/api/maps') {
      const list = listMaps()
      sendJson(res, 200, list)
      return
    }

    // POST /api/maps
    if (method === 'POST' && pathname === '/api/maps') {
      const body = await readJsonBody(req)
      const id = generateId()
      const title = body.title || '未命名导图'
      const data = body.data || DEFAULT_DATA
      const updatedBy = body.source || body.updatedBy || 'human'
      const map = createMap({ id, title, data, updatedBy })
      sendJson(res, 201, map)
      return
    }

    // GET /api/maps/:id
    let params = matchRoute(method, pathname, 'GET', '/api/maps/:id')
    if (params) {
      const map = getMap(params.id)
      if (!map) {
        send404(res, '导图不存在')
        return
      }
      sendJson(res, 200, map)
      return
    }

    // PUT /api/maps/:id
    params = matchRoute(method, pathname, 'PUT', '/api/maps/:id')
    if (params) {
      const body = await readJsonBody(req)
      const map = getMap(params.id)
      if (!map) {
        send404(res, '导图不存在')
        return
      }
      if (body.revision !== map.revision) {
        send409(res, { error: '版本冲突', map })
        return
      }
      const newData = body.data || map.data
      const newTitle = body.title || map.title
      const newRevision = map.revision + 1
      const updatedBy = body.updatedBy || 'human'
      const updated = updateMap({
        id: params.id,
        title: newTitle,
        data: newData,
        revision: newRevision,
        updatedBy
      })
      // 版本快照逻辑
      if (body.manualSnapshot || updatedBy === 'mcp' || shouldArchiveVersion(params.id, newData)) {
        createVersion({
          mapId: params.id,
          revision: map.revision,
          data: map.data,
          source: updatedBy
        })
      }
      sendJson(res, 200, updated)
      return
    }

    // DELETE /api/maps/:id
    params = matchRoute(method, pathname, 'DELETE', '/api/maps/:id')
    if (params) {
      deleteMap(params.id)
      sendJson(res, 200, { success: true })
      return
    }

    // PUT /api/maps/:id/title
    params = matchRoute(method, pathname, 'PUT', '/api/maps/:id/title')
    if (params) {
      const body = await readJsonBody(req)
      if (!body.title) {
        send400(res, '标题不能为空')
        return
      }
      const map = renameMap({ id: params.id, title: body.title })
      sendJson(res, 200, map)
      return
    }

    // POST /api/maps/import
    if (method === 'POST' && pathname === '/api/maps/import') {
      const body = await readJsonBody(req)
      const id = body.id || generateId()
      const title = body.title || '导入导图'
      const data = body.data || DEFAULT_DATA
      const source = body.source || 'import'
      const force = !!body.force
      const existing = getMap(id)
      if (existing) {
        if (!force) {
          send400(res, '导图已存在，使用 force=true 强制覆盖')
          return
        }
        // 归档当前版本
        createVersion({
          mapId: id,
          revision: existing.revision,
          data: existing.data,
          source
        })
        const updated = updateMap({
          id,
          title,
          data,
          revision: existing.revision + 1,
          updatedBy: source
        })
        sendJson(res, 200, updated)
      } else {
        const map = createMap({ id, title, data, updatedBy: source })
        sendJson(res, 201, map)
      }
      return
    }

    // GET /api/maps/:id/versions
    params = matchRoute(method, pathname, 'GET', '/api/maps/:id/versions')
    if (params) {
      const versions = listVersions(params.id)
      sendJson(res, 200, versions)
      return
    }

    // POST /api/maps/:id/versions/:versionId/restore
    params = matchRoute(method, pathname, 'POST', '/api/maps/:id/versions/:versionId/restore')
    if (params) {
      const map = getMap(params.id)
      if (!map) {
        send404(res, '导图不存在')
        return
      }
      const version = getVersion(parseInt(params.versionId, 10))
      if (!version || version.mapId !== params.id) {
        send404(res, '版本不存在')
        return
      }
      // 归档当前版本
      createVersion({
        mapId: params.id,
        revision: map.revision,
        data: map.data,
        source: 'rollback'
      })
      // 恢复
      const updated = updateMap({
        id: params.id,
        title: map.title,
        data: version.data,
        revision: map.revision + 1,
        updatedBy: 'rollback'
      })
      sendJson(res, 200, updated)
      return
    }

    // POST /api/maps/:id/share
    params = matchRoute(method, pathname, 'POST', '/api/maps/:id/share')
    if (params) {
      const map = getMap(params.id)
      if (!map) {
        send404(res, '导图不存在')
        return
      }
      const body = await readJsonBody(req)
      const token = generateToken()
      const expiresAt = body.expires_at || null
      createShare({ token, mapId: params.id, expiresAt })
      sendJson(res, 201, { token, expires_at: expiresAt })
      return
    }

    // GET /api/shares/:token
    params = matchRoute(method, pathname, 'GET', '/api/shares/:token')
    if (params) {
      const share = getShare(params.token)
      if (!share || share.revoked) {
        send404(res, '分享链接无效或已吊销')
        return
      }
      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        send404(res, '分享链接已过期')
        return
      }
      const map = getMap(share.mapId)
      if (!map) {
        send404(res, '导图不存在')
        return
      }
      // 严禁返回 map_id
      sendJson(res, 200, {
        title: map.title,
        data: map.data,
        updated_at: map.updated_at
      })
      return
    }

    // DELETE /api/shares/:token
    params = matchRoute(method, pathname, 'DELETE', '/api/shares/:token')
    if (params) {
      revokeShare(params.token)
      sendJson(res, 200, { success: true })
      return
    }

    // ─── POST /api/mcp/command（MCP 指令中枢） ───
    if (method === 'POST' && pathname === '/api/mcp/command') {
      await handleMcpCommand(req, res)
      return
    }

    send404(res, 'API 不存在')
  } catch (e) {
    console.error('API 错误:', e)
    sendJson(res, 500, { error: e.message || '服务器内部错误' })
  }
}

// ─── MCP 指令处理 ───

function resolveTargetMapId () {
  if (activeMcpMapId && getMap(activeMcpMapId)) return activeMcpMapId
  // 回退到最近连接的 WS 客户端的 mapId
  for (let i = wsClients.length - 1; i >= 0; i--) {
    if (wsClients[i].mapId && getMap(wsClients[i].mapId)) {
      return wsClients[i].mapId
    }
  }
  return null
}

async function handleMcpCommand (req, res) {
  try {
    const body = await readJsonBody(req)
    const { tool, args } = body
    if (!tool) { send400(res, '缺少 tool 参数'); return }

    switch (tool) {
      case 'start_editor': {
        const id = generateId()
        createMap({ id, title: '未命名导图', data: MCP_DEFAULT_DATA, updatedBy: 'mcp' })
        activeMcpMapId = id
        const skipBrowserOpen = args?.skipBrowserOpen === true
        if (!skipBrowserOpen) {
          const { exec } = await import('node:child_process')
          const openUrl = `http://localhost:${PORT}/e/${id}`
          const cmd = process.platform === 'win32' ? `start "" "${openUrl}"`
            : process.platform === 'darwin' ? `open "${openUrl}"`
            : `xdg-open "${openUrl}"`
          exec(cmd, () => {}) // 静默执行
        }
        sendJson(res, 200, {
          mapId: id,
          url: `http://localhost:${PORT}/e/${id}`,
          message: '思维导图编辑器已打开，可以开始绘制了'
        })
        return
      }

      case 'set_mind_map_data': {
        // 回退命中（WS 客户端打开的图）时显式提示，避免静默写错图
        const targetWarnings = []
        let targetMapId = resolveTargetMapId()
        if (targetMapId && targetMapId !== activeMcpMapId) {
          const fallbackMap = getMap(targetMapId)
          targetWarnings.push(
            `未指定目标导图，已回退到当前浏览器打开的图「${(fallbackMap && fallbackMap.title) || targetMapId}」(${targetMapId})；` +
            '如需新建导图请先调用 start_editor'
          )
        }
        if (!targetMapId) {
          const id = generateId()
          createMap({ id, title: '未命名导图', data: MCP_DEFAULT_DATA, updatedBy: 'mcp' })
          targetMapId = id
          activeMcpMapId = id
        }

        const existing = getMap(targetMapId)
        if (!existing) { send404(res, '导图不存在'); return }

        const root = parseMarkdownToRoot(args.data)
        if (!root) { send400(res, 'Markdown 解析结果为空'); return }

        // 结构体检：疑似平铺的线性调用链时回传 warning（AI 可据此改写 Markdown 重新生成）
        const structureWarnings = detectFlatChain(root)
        const allWarnings = [...targetWarnings, ...structureWarnings]

        // 标题自动提取
        let newTitle = existing.title
        if (existing.title === '未命名导图' && root.data?.text) {
          newTitle = root.data.text
        }

        const newData = {
          ...existing.data,
          root,
          layout: args.layout || existing.data?.layout || 'logicalStructure',
          theme: {
            template: args.theme || existing.data?.theme?.template || 'avocado',
            config: existing.data?.theme?.config || {}
          }
        }

        // 归档旧版本快照
        createVersion({ mapId: targetMapId, revision: existing.revision, data: existing.data, source: 'mcp' })

        const updated = updateMap({
          id: targetMapId,
          title: newTitle,
          data: newData,
          revision: existing.revision + 1,
          updatedBy: 'mcp'
        })

        // 广播给 WS 客户端
        broadcastToMap(targetMapId, {
          type: 'set_mind_map_data',
          data: args.data,
          fullData: { root: newData.root, layout: newData.layout, theme: newData.theme },
          revision: updated.revision,
          title: newTitle,
          savedByServer: true
        })

        sendJson(res, 200, {
          success: true,
          mapId: targetMapId,
          revision: updated.revision,
          title: newTitle,
          warnings: allWarnings
        })
        return
      }

      case 'set_mind_map_layout': {
        const targetMapId = resolveTargetMapId()
        if (!targetMapId) { send400(res, '没有活跃的导图'); return }
        const existing = getMap(targetMapId)
        if (!existing) { send404(res, '导图不存在'); return }

        const newData = { ...existing.data, layout: args.layout }
        createVersion({ mapId: targetMapId, revision: existing.revision, data: existing.data, source: 'mcp' })
        const updated = updateMap({
          id: targetMapId, title: existing.title, data: newData,
          revision: existing.revision + 1, updatedBy: 'mcp'
        })

        broadcastToMap(targetMapId, {
          type: 'set_mind_map_layout', layout: args.layout,
          revision: updated.revision, savedByServer: true
        })

        sendJson(res, 200, { success: true, mapId: targetMapId, revision: updated.revision })
        return
      }

      case 'set_mind_map_theme': {
        const targetMapId = resolveTargetMapId()
        if (!targetMapId) { send400(res, '没有活跃的导图'); return }
        const existing = getMap(targetMapId)
        if (!existing) { send404(res, '导图不存在'); return }

        const newData = {
          ...existing.data,
          theme: { ...existing.data?.theme, template: args.theme, config: existing.data?.theme?.config || {} }
        }
        createVersion({ mapId: targetMapId, revision: existing.revision, data: existing.data, source: 'mcp' })
        const updated = updateMap({
          id: targetMapId, title: existing.title, data: newData,
          revision: existing.revision + 1, updatedBy: 'mcp'
        })

        broadcastToMap(targetMapId, {
          type: 'set_mind_map_theme', theme: args.theme,
          revision: updated.revision, savedByServer: true
        })

        sendJson(res, 200, { success: true, mapId: targetMapId, revision: updated.revision })
        return
      }

      case 'export_mind_map_to': {
        const targetMapId = resolveTargetMapId()
        if (!targetMapId) { send400(res, '没有活跃的导图'); return }

        // 等待浏览器客户端连接（支持后台标签页重连，最多等 15s）
        let mapWsClients = wsClients.filter(c => c.mapId === targetMapId && isWsOpen(c.socket))
        if (mapWsClients.length === 0) {
          log('[Export] 无浏览器客户端，等待重连...')
          const waitStart = Date.now()
          const maxWaitMs = 15000
          while (Date.now() - waitStart < maxWaitMs) {
            await new Promise(r => setTimeout(r, 2000))
            mapWsClients = wsClients.filter(c => c.mapId === targetMapId && isWsOpen(c.socket))
            if (mapWsClients.length > 0) break
          }
          if (mapWsClients.length === 0) {
            sendJson(res, 200, { success: false, error: '没有已连接的浏览器客户端（已等待 15s），请确保浏览器编辑页已打开' })
            return
          }
          log('[Export] 浏览器客户端已重连，继续导出')
        }

        const reqId = generateId()
        const exportOnBrowser = !args.saveFolder

        if (exportOnBrowser && !args.saveFolder) {
          // 浏览器下载模式：通知浏览器触发下载
          broadcastToMap(targetMapId, {
            type: 'export_mind_map_to', id: reqId,
            exportType: args.exportType, exportOnBrowser: true
          })
          sendJson(res, 200, { success: true, message: '已在浏览器端触发导出' })
        } else {
          // 服务端保存模式：等待浏览器回传数据
          const result = await new Promise((resolve) => {
            const timer = setTimeout(() => {
              pendingExports.delete(reqId)
              resolve({ success: false, error: '导出超时（30s）' })
            }, 30000)
            pendingExports.set(reqId, { resolve, timer })

            broadcastToMap(targetMapId, {
              type: 'export_mind_map_to', id: reqId,
              exportType: args.exportType, exportOnBrowser: false
            })
          })

          if (result.data && args.saveFolder) {
            const extMap = { png: '.png', svg: '.svg', pdf: '.pdf', md: '.md', txt: '.txt', xmind: '.xmind', xlsx: '.xlsx' }
            const ext = extMap[args.exportType] || '.bin'
            const savePath = join(args.saveFolder, `思维导图${ext}`)
            try {
              fsMkdirSync(args.saveFolder, { recursive: true })
              if (['md', 'txt'].includes(args.exportType)) {
                writeFileSync(savePath, result.data.startsWith('data:') && result.data.includes(';base64,') ? Buffer.from(result.data.slice(result.data.indexOf(';base64,') + 8), 'base64') : Buffer.from(result.data, 'utf8'))
              } else {
                writeFileSync(savePath, Buffer.from(result.data.startsWith('data:') && result.data.includes(';base64,') ? result.data.slice(result.data.indexOf(';base64,') + 8) : result.data, 'base64'))
              }
              sendJson(res, 200, { success: true, savedPath: savePath })
            } catch (e) {
              sendJson(res, 200, { success: false, error: `文件写入失败: ${e.message}` })
            }
          } else {
            sendJson(res, 200, result)
          }
        }
        return
      }

      case 'close_editor': {
        const targetMapId = resolveTargetMapId()
        if (targetMapId) {
          broadcastToMap(targetMapId, { type: 'close_editor' })
        }
        activeMcpMapId = null
        sendJson(res, 200, { success: true, message: '编辑器已关闭' })
        return
      }

      default:
        send400(res, `未知工具: ${tool}`)
    }
  } catch (e) {
    console.error('[MCP Command] 错误:', e)
    sendJson(res, 500, { error: e.message || '服务器内部错误' })
  }
}

// 启动服务器
const server = createServer(handleRequest)

// 同端口 WebSocket 升级
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname === '/ws/mcp') {
    handleWsUpgrade(req, socket, head)
  } else {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
  }
})

server.listen(PORT, HOST, async () => {
  const lanIp = await getLanIp()
  console.log(`\n✅ 思绪思维导图服务已启动`)
  console.log(`   本机访问：http://localhost:${PORT}`)
  console.log(`   局域网访问：http://${lanIp}:${PORT}`)
  console.log(`   数据库：${process.env.MIND_MAP_DB || join(__dirname, 'data', 'mindmap.db')}\n`)
})
