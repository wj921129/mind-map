import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
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
      const map = createMap({ id, title, data, updatedBy: 'human' })
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
      if (body.manualSnapshot || shouldArchiveVersion(params.id, newData)) {
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

    send404(res, 'API 不存在')
  } catch (e) {
    console.error('API 错误:', e)
    sendJson(res, 500, { error: e.message || '服务器内部错误' })
  }
}

// 启动服务器
const server = createServer(handleRequest)

server.listen(PORT, HOST, async () => {
  const lanIp = await getLanIp()
  console.log(`\n✅ 思绪思维导图服务已启动`)
  console.log(`   本机访问：http://localhost:${PORT}`)
  console.log(`   局域网访问：http://${lanIp}:${PORT}`)
  console.log(`   数据库：${process.env.MIND_MAP_DB || join(__dirname, 'data', 'mindmap.db')}\n`)
})
