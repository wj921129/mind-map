import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '..')
const INDEX_HTML_PATH = join(ROOT_DIR, 'index.html')

// 缓存解析结果
let cachedAssets = null

// 从根目录 index.html 解析静态资源文件名（带 hash 的 chunk）
function parseAssets () {
  if (cachedAssets) return cachedAssets
  if (!existsSync(INDEX_HTML_PATH)) {
    throw new Error('根目录 index.html 不存在，请先构建 web 应用')
  }
  const html = readFileSync(INDEX_HTML_PATH, 'utf8')
  const cssLinks = []
  const jsScripts = []
  // 匹配 <link href="dist/css/...">
  const linkRegex = /<link[^>]+href="(dist\/css\/[^"]+)"/g
  let m
  while ((m = linkRegex.exec(html)) !== null) {
    cssLinks.push(m[1])
  }
  // 匹配 <script src="dist/js/...">
  const scriptRegex = /<script[^>]+src="(dist\/js\/[^"]+)"/g
  while ((m = scriptRegex.exec(html)) !== null) {
    jsScripts.push(m[1])
  }
  cachedAssets = { cssLinks, jsScripts }
  return cachedAssets
}

// 构建宿主 HTML 头部（CSS 链接）
function buildCssLinks () {
  const { cssLinks } = parseAssets()
  return cssLinks
    .map(href => `<link href="/${href}" rel="stylesheet">`)
    .join('\n    ')
}

// 构建宿主 HTML 尾部脚本（JS）
function buildJsScripts () {
  const { jsScripts } = parseAssets()
  return jsScripts
    .map(src => `<script src="/${src}"></script>`)
    .join('\n    ')
}

// 生成编辑页宿主 HTML
export function buildEditHostHtml ({ mapId, title }) {
  const cssLinks = buildCssLinks()
  const jsScripts = buildJsScripts()
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width,user-scalable=no,initial-scale=1,maximum-scale=1,minimum-scale=1">
  <link rel="icon" href="/dist/logo.ico">
  <title>${escapeHtml(title || '思绪思维导图')}</title>
  <script>
    window.externalPublicPath = '/dist/'
    window.takeOverApp = true
    window.__MAP_ID__ = '${escapeJs(mapId)}'
  </script>
  ${cssLinks}
  <style>
    .mm-capsule {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.92);
      border: 1px solid #e4e7ed;
      border-radius: 20px;
      padding: 6px 14px;
      font-size: 13px;
      z-index: 9999;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }
    .mm-capsule a { color: #409eff; text-decoration: none; }
    .mm-capsule .mm-title { cursor: pointer; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mm-capsule .mm-title:hover { color: #409eff; }
    .mm-capsule .mm-status { font-size: 12px; color: #909399; }
    .mm-capsule .mm-status.saving { color: #e6a23c; }
    .mm-capsule .mm-status.conflict { color: #f56c6c; }
    .mm-capsule button {
      border: 1px solid #dcdfe6;
      background: #fff;
      border-radius: 14px;
      padding: 3px 10px;
      font-size: 12px;
      cursor: pointer;
      color: #606266;
    }
    .mm-capsule button:hover { color: #409eff; border-color: #409eff; }
    .mm-dialog-mask {
      position: fixed; top:0; left:0; right:0; bottom:0;
      background: rgba(0,0,0,0.4); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
    }
    .mm-dialog {
      background: #fff; border-radius: 8px; padding: 20px; min-width: 360px; max-width: 600px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
    .mm-dialog h3 { margin: 0 0 12px; font-size: 16px; }
    .mm-dialog .mm-dialog-body { font-size: 14px; color: #606266; line-height: 1.6; }
    .mm-dialog .mm-dialog-footer { margin-top: 16px; text-align: right; }
    .mm-dialog button {
      border: 1px solid #dcdfe6; background: #fff; border-radius: 4px;
      padding: 6px 14px; font-size: 13px; cursor: pointer; margin-left: 8px;
    }
    .mm-dialog button.primary { background: #409eff; color: #fff; border-color: #409eff; }
    .mm-dialog button.danger { background: #f56c6c; color: #fff; border-color: #f56c6c; }
    .mm-share-link {
      display: flex; align-items: center; gap: 8px; margin: 8px 0;
    }
    .mm-share-link input {
      flex: 1; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px;
    }
    .mm-version-list { max-height: 300px; overflow-y: auto; margin: 8px 0; }
    .mm-version-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px; border-bottom: 1px solid #f0f0f0; font-size: 13px;
    }
    .mm-version-item:last-child { border-bottom: none; }
  </style>
</head>
<body>
  <noscript>请启用 JavaScript 以继续使用思绪思维导图。</noscript>
  <div id="app"></div>
  <div class="mm-capsule" id="mmCapsule" style="display:none;">
    <a href="/">← 列表</a>
    <span class="mm-title" id="mmTitle" title="点击重命名"></span>
    <span class="mm-status" id="mmStatus">已保存</span>
    <button id="mmShareBtn">分享</button>
    <button id="mmHistoryBtn">历史版本</button>
  </div>
  ${jsScripts}
  <script>
  (function() {
    var MAP_ID = window.__MAP_ID__
    var currentRevision = 1
    var pendingData = null
    var saveTimer = null
    var manualSavePending = false
    var mapData = null
    var mapTitle = ''

    var statusEl = document.getElementById('mmStatus')
    var titleEl = document.getElementById('mmTitle')
    var capsuleEl = document.getElementById('mmCapsule')

    function setStatus(text, cls) {
      statusEl.textContent = text
      statusEl.className = 'mm-status' + (cls ? ' ' + cls : '')
    }

    async function fetchMap() {
      var res = await fetch('/api/maps/' + MAP_ID)
      if (!res.ok) {
        alert('加载导图失败：' + res.status)
        return
      }
      var json = await res.json()
      mapData = json.data
      mapTitle = json.title
      currentRevision = json.revision
      titleEl.textContent = mapTitle
      titleEl.title = mapTitle
      capsuleEl.style.display = 'flex'
    }

    function debouncedSave(data) {
      pendingData = data
      if (manualSavePending) {
        manualSavePending = false
        flushSave()
      } else {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(flushSave, 1500)
      }
      setStatus('待保存...', '')
    }

    async function flushSave() {
      clearTimeout(saveTimer)
      if (!pendingData) return
      setStatus('保存中...', 'saving')
      try {
        var res = await fetch('/api/maps/' + MAP_ID, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: pendingData,
            revision: currentRevision,
            title: mapTitle,
            manualSnapshot: false
          })
        })
        if (res.status === 409) {
          var json = await res.json()
          setStatus('冲突', 'conflict')
          showConflictDialog(json)
          return
        }
        if (!res.ok) {
          setStatus('保存失败', 'conflict')
          return
        }
        var result = await res.json()
        currentRevision = result.revision
        pendingData = null
        setStatus('已保存', '')
      } catch (e) {
        console.error(e)
        setStatus('保存失败', 'conflict')
      }
    }

    function showConflictDialog() {
      var mask = document.createElement('div')
      mask.className = 'mm-dialog-mask'
      mask.innerHTML = '<div class="mm-dialog">' +
        '<h3>版本冲突</h3>' +
        '<div class="mm-dialog-body">其他标签页或 MCP 已修改此导图，当前修改无法直接覆盖。<br>是否刷新页面以获取最新版本？</div>' +
        '<div class="mm-dialog-footer">' +
          '<button id="mmConflictCancel">取消</button>' +
          '<button id="mmConflictReload" class="primary">刷新页面</button>' +
        '</div></div>'
      document.body.appendChild(mask)
      mask.querySelector('#mmConflictCancel').onclick = function() {
        document.body.removeChild(mask)
        setStatus('冲突', 'conflict')
      }
      mask.querySelector('#mmConflictReload').onclick = function() {
        location.reload()
      }
    }

    function showShareDialog() {
      var mask = document.createElement('div')
      mask.className = 'mm-dialog-mask'
      mask.innerHTML = '<div class="mm-dialog">' +
        '<h3>生成分享链接</h3>' +
        '<div class="mm-dialog-body">' +
          '<p>有效期：</p>' +
          '<select id="mmShareExpiry" style="padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;">' +
            '<option value="">永久</option>' +
            '<option value="1h">1 小时</option>' +
            '<option value="1d">1 天</option>' +
            '<option value="7d">7 天</option>' +
          '</select>' +
          '<div id="mmShareResult" style="margin-top:12px;display:none;">' +
            '<p>分享链接：</p>' +
            '<div class="mm-share-link">' +
              '<input id="mmShareLink" readonly>' +
              '<button id="mmShareCopy" class="primary">复制</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="mm-dialog-footer">' +
          '<button id="mmShareClose">关闭</button>' +
          '<button id="mmShareCreate" class="primary">生成</button>' +
        '</div></div>'
      document.body.appendChild(mask)
      mask.querySelector('#mmShareClose').onclick = function() { document.body.removeChild(mask) }
      mask.querySelector('#mmShareCreate').onclick = async function() {
        var expiry = mask.querySelector('#mmShareExpiry').value
        var expires_at = null
        if (expiry) {
          var ms = { '1h': 3600000, '1d': 86400000, '7d': 604800000 }[expiry]
          expires_at = new Date(Date.now() + ms).toISOString()
        }
        try {
          var res = await fetch('/api/maps/' + MAP_ID + '/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expires_at: expires_at })
          })
          if (!res.ok) { alert('生成失败'); return }
          var json = await res.json()
          var link = location.origin + '/v/' + json.token
          mask.querySelector('#mmShareLink').value = link
          mask.querySelector('#mmShareResult').style.display = 'block'
        } catch (e) { alert('生成失败：' + e.message) }
      }
      mask.querySelector('#mmShareCopy').onclick = function() {
        var input = mask.querySelector('#mmShareLink')
        input.select()
        document.execCommand('copy')
        this.textContent = '已复制'
      }
    }

    function showHistoryDialog() {
      var mask = document.createElement('div')
      mask.className = 'mm-dialog-mask'
      mask.innerHTML = '<div class="mm-dialog">' +
        '<h3>历史版本</h3>' +
        '<div class="mm-dialog-body">' +
          '<div class="mm-version-list" id="mmVersionList">加载中...</div>' +
        '</div>' +
        '<div class="mm-dialog-footer">' +
          '<button id="mmHistoryClose">关闭</button>' +
        '</div></div>'
      document.body.appendChild(mask)
      mask.querySelector('#mmHistoryClose').onclick = function() { document.body.removeChild(mask) }
      loadVersions(mask.querySelector('#mmVersionList'))
    }

    async function loadVersions(container) {
      try {
        var res = await fetch('/api/maps/' + MAP_ID + '/versions')
        if (!res.ok) { container.textContent = '加载失败'; return }
        var list = await res.json()
        if (list.length === 0) { container.textContent = '暂无历史版本'; return }
        container.innerHTML = ''
        list.forEach(function(v) {
          var item = document.createElement('div')
          item.className = 'mm-version-item'
          var date = new Date(v.created_at).toLocaleString()
          item.innerHTML = '<span>#' + v.revision + ' · ' + v.source + ' · ' + date + '</span>' +
            '<button class="primary" data-id="' + v.id + '">恢复</button>'
          container.appendChild(item)
        })
        container.querySelectorAll('button[data-id]').forEach(function(btn) {
          btn.onclick = async function() {
            if (!confirm('确定要恢复到此版本？当前版本将自动存档。')) return
            var vid = btn.getAttribute('data-id')
            var r = await fetch('/api/maps/' + MAP_ID + '/versions/' + vid + '/restore', { method: 'POST' })
            if (!r.ok) { alert('恢复失败'); return }
            location.reload()
          }
        })
      } catch (e) { container.textContent = '加载失败：' + e.message }
    }

    titleEl.onclick = function() {
      var newTitle = prompt('请输入新标题：', mapTitle)
      if (newTitle === null || newTitle === mapTitle) return
      fetch('/api/maps/' + MAP_ID + '/title', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      }).then(function(res) {
        if (res.ok) {
          mapTitle = newTitle
          titleEl.textContent = newTitle
          titleEl.title = newTitle
        }
      })
    }

    document.getElementById('mmShareBtn').onclick = showShareDialog
    document.getElementById('mmHistoryBtn').onclick = showHistoryDialog

    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        manualSavePending = true
        flushSave()
      }
    })

    window.takeOverAppMethods = {
      getMindMapData: function() { return mapData },
      saveMindMapData: function(data) {
        mapData = Object.assign({}, mapData, data)
        debouncedSave(mapData)
      },
      getMindMapConfig: function() { return (mapData && mapData.config) || {} },
      saveMindMapConfig: function() {},
      getLanguage: function() { return 'zh' },
      saveLanguage: function() {},
      getLocalConfig: function() { return null },
      saveLocalConfig: function() {}
    }

    window.onload = async function() {
      await fetchMap()
      window.initApp()
    }
  })()
  </script>
</body>
</html>`
}

// 生成只读页宿主 HTML
export function buildViewHostHtml ({ token, title }) {
  const cssLinks = buildCssLinks()
  const jsScripts = buildJsScripts()
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width,user-scalable=no,initial-scale=1,maximum-scale=1,minimum-scale=1">
  <link rel="icon" href="/dist/logo.ico">
  <title>${escapeHtml(title || '思绪思维导图 - 只读')}</title>
  <script>
    window.externalPublicPath = '/dist/'
    window.takeOverApp = true
    window.__SHARE_TOKEN__ = '${escapeJs(token)}'
  </script>
  ${cssLinks}
  <style>
    .toolbarContainer,
    .navigatorContainer,
    .sidebarTriggerContainer,
    .contextmenuContainer {
      display: none !important;
    }
    .mm-readonly-bar {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255,255,255,0.92);
      border: 1px solid #e4e7ed;
      border-radius: 20px;
      padding: 6px 14px;
      font-size: 13px;
      z-index: 9999;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mm-readonly-bar .mm-badge {
      background: #e6a23c;
      color: #fff;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <noscript>请启用 JavaScript 以继续使用思绪思维导图。</noscript>
  <div id="app"></div>
  <div class="mm-readonly-bar" id="mmReadonlyBar" style="display:none;">
    <span id="mmReadonlyTitle"></span>
    <span class="mm-badge">只读</span>
  </div>
  ${jsScripts}
  <script>
  (function() {
    var TOKEN = window.__SHARE_TOKEN__
    var mapData = null
    var mapTitle = ''

    async function fetchShare() {
      var res = await fetch('/api/shares/' + TOKEN)
      if (!res.ok) {
        document.body.innerHTML = '<div style="text-align:center;padding:80px;color:#f56c6c;font-size:16px;">链接无效或已过期</div>'
        return false
      }
      var json = await res.json()
      mapData = json.data
      mapTitle = json.title
      document.getElementById('mmReadonlyTitle').textContent = mapTitle
      document.getElementById('mmReadonlyBar').style.display = 'flex'
      return true
    }

    window.takeOverAppMethods = {
      getMindMapData: function() { return mapData },
      saveMindMapData: function() {},
      getMindMapConfig: function() { return {} },
      saveMindMapConfig: function() {},
      getLanguage: function() { return 'zh' },
      saveLanguage: function() {},
      getLocalConfig: function() { return null },
      saveLocalConfig: function() {}
    }

    window.onload = async function() {
      var ok = await fetchShare()
      if (!ok) return
      window.initApp()
      window.$bus.$on('app_inited', function(mindMap) {
        mindMap.setMode('readonly')
      })
    }
  })()
  </script>
</body>
</html>`
}

function escapeHtml (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeJs (str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"')
}
