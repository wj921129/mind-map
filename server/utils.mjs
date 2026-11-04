import { randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'

// 生成 16 字符的十六进制 id
export function generateId () {
  return randomBytes(8).toString('hex')
}

// 生成 32 字符的十六进制分享 token（16 字节）
export function generateToken () {
  return randomBytes(16).toString('hex')
}

// 读取请求体 JSON
export function readJsonBody (req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch (e) {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

// 发送 JSON 响应
export function sendJson (res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

// 发送 HTML 响应
export function sendHtml (res, status, html) {
  const body = Buffer.from(html, 'utf8')
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length
  })
  res.end(body)
}

// 发送 404
export function send404 (res, message = 'Not Found') {
  sendJson(res, 404, { error: message })
}

// 发送 400
export function send400 (res, message = 'Bad Request') {
  sendJson(res, 400, { error: message })
}

// 发送 409
export function send409 (res, data) {
  sendJson(res, 409, data)
}

// 从 URL 路径中解析路由参数
export function matchRoute (method, pathname, expectedMethod, pattern) {
  if (method !== expectedMethod) return null
  const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$')
  const match = pathname.match(regex)
  if (!match) return null
  const names = (pattern.match(/:[^/]+/g) || []).map(s => s.slice(1))
  const params = {}
  names.forEach((name, i) => {
    params[name] = match[i + 1]
  })
  return params
}

// 获取本机局域网 IP
export function getLanIp () {
  const interfaces = networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}
