#!/usr/bin/env node

/**
 * 集成测试脚本
 * 启动服务器后运行此脚本进行 API 冒烟测试
 *
 * 用法：
 *   1. 先启动服务器：node server/server.mjs
 *   2. 另开终端运行：node server/tests/smoke.mjs
 */

const SERVER = process.env.TEST_SERVER || 'http://localhost:8088'

let passed = 0
let failed = 0

function log (msg) {
  console.log(`  ${msg}`)
}

function ok (msg) {
  passed++
  log(`✅ ${msg}`)
}

function fail (msg) {
  failed++
  log(`❌ ${msg}`)
}

async function request (method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(SERVER + path, opts)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch (e) {
    json = text
  }
  return { status: res.status, json, text }
}

async function run () {
  console.log('\n🧪 开始集成测试...\n')

  // 1. 创建导图
  log('测试 1：创建导图')
  let res = await request('POST', '/api/maps', { title: '测试导图' })
  if (res.status === 201 && res.json.id) {
    ok('创建导图成功')
  } else {
    fail('创建导图失败：' + res.text)
    return
  }
  const mapId = res.json.id

  // 2. 获取导图
  log('测试 2：获取导图')
  res = await request('GET', '/api/maps/' + mapId)
  if (res.status === 200 && res.json.title === '测试导图') {
    ok('获取导图成功')
  } else {
    fail('获取导图失败')
  }

  // 3. 列表
  log('测试 3：获取导图列表')
  res = await request('GET', '/api/maps')
  if (res.status === 200 && Array.isArray(res.json) && res.json.length >= 1) {
    ok('获取列表成功')
  } else {
    fail('获取列表失败')
  }

  // 4. 更新导图（带 revision）
  log('测试 4：更新导图')
  const currentRevision = (await request('GET', '/api/maps/' + mapId)).json.revision
  res = await request('PUT', '/api/maps/' + mapId, {
    data: {
      root: { data: { text: '修改后的根节点' }, children: [] },
      theme: { template: 'avocado', config: {} },
      layout: 'logicalStructure',
      config: {},
      view: null
    },
    revision: currentRevision,
    title: '测试导图-已修改'
  })
  if (res.status === 200 && res.json.revision === currentRevision + 1) {
    ok('更新导图成功')
  } else {
    fail('更新导图失败：' + res.text)
  }

  // 5. 版本冲突测试
  log('测试 5：版本冲突')
  res = await request('PUT', '/api/maps/' + mapId, {
    data: { root: { data: { text: '冲突测试' }, children: [] } },
    revision: currentRevision // 使用旧 revision
  })
  if (res.status === 409) {
    ok('版本冲突检测成功')
  } else {
    fail('版本冲突检测失败')
  }

  // 6. 重命名
  log('测试 6：重命名导图')
  res = await request('PUT', '/api/maps/' + mapId + '/title', { title: '新标题' })
  if (res.status === 200 && res.json.title === '新标题') {
    ok('重命名成功')
  } else {
    fail('重命名失败')
  }

  // 7. 创建分享
  log('测试 7：创建分享链接')
  res = await request('POST', '/api/maps/' + mapId + '/share', {})
  if (res.status === 201 && res.json.token) {
    ok('创建分享成功')
  } else {
    fail('创建分享失败')
  }
  const token = res.json.token

  // 8. 获取分享内容
  log('测试 8：获取分享内容')
  res = await request('GET', '/api/shares/' + token)
  if (res.status === 200 && res.json.title === '新标题' && !res.json.id) {
    ok('获取分享内容成功（未泄露 map_id）')
  } else {
    fail('获取分享内容失败')
  }

  // 9. 吊销分享
  log('测试 9：吊销分享')
  res = await request('DELETE', '/api/shares/' + token)
  if (res.status === 200) {
    ok('吊销分享成功')
  } else {
    fail('吊销分享失败')
  }

  // 10. 验证吊销后无法访问
  log('测试 10：验证吊销后无法访问')
  res = await request('GET', '/api/shares/' + token)
  if (res.status === 404) {
    ok('吊销后访问返回 404')
  } else {
    fail('吊销后仍可访问')
  }

  // 11. 导入（新建）
  log('测试 11：导入导图（新建）')
  res = await request('POST', '/api/maps/import', {
    title: '导入测试',
    data: {
      root: { data: { text: '导入根节点' }, children: [] },
      theme: { template: 'freshGreen', config: {} },
      layout: 'mindMap',
      config: {},
      view: null
    },
    source: 'mcp'
  })
  if (res.status === 201 && res.json.id) {
    ok('导入新建成功')
  } else {
    fail('导入新建失败')
  }
  const importId = res.json.id

  // 12. 导入（覆盖）
  log('测试 12：导入导图（覆盖）')
  res = await request('POST', '/api/maps/import', {
    id: importId,
    title: '导入测试-覆盖',
    data: {
      root: { data: { text: '覆盖后根节点' }, children: [] },
      theme: { template: 'freshGreen', config: {} },
      layout: 'mindMap',
      config: {},
      view: null
    },
    source: 'mcp',
    force: true
  })
  if (res.status === 200 && res.json.title === '导入测试-覆盖') {
    ok('导入覆盖成功')
  } else {
    fail('导入覆盖失败')
  }

  // 13. 查看历史版本
  log('测试 13：查看历史版本')
  res = await request('GET', '/api/maps/' + importId + '/versions')
  if (res.status === 200 && Array.isArray(res.json) && res.json.length >= 1) {
    ok('查看历史版本成功')
  } else {
    fail('查看历史版本失败')
  }

  // 14. 恢复历史版本
  log('测试 14：恢复历史版本')
  const versions = (await request('GET', '/api/maps/' + importId + '/versions')).json
  if (versions.length > 0) {
    const versionId = versions[0].id
    res = await request('POST', '/api/maps/' + importId + '/versions/' + versionId + '/restore')
    if (res.status === 200) {
      ok('恢复历史版本成功')
    } else {
      fail('恢复历史版本失败')
    }
  }

  // 15. 删除导图
  log('测试 15：删除导图')
  res = await request('DELETE', '/api/maps/' + mapId)
  if (res.status === 200) {
    ok('删除导图成功')
  } else {
    fail('删除导图失败')
  }

  // 16. 验证删除
  log('测试 16：验证删除')
  res = await request('GET', '/api/maps/' + mapId)
  if (res.status === 44) {
    fail('验证删除失败：状态码异常')
  } else if (res.status === 404) {
    ok('验证删除成功')
  } else {
    fail('验证删除失败')
  }

  // 17. 静态资源测试
  log('测试 17：静态资源访问')
  res = await request('GET', '/dist/logo.ico')
  if (res.status === 200) {
    ok('静态资源访问成功')
  } else {
    fail('静态资源访问失败')
  }

  // 18. 页面路由测试
  log('测试 18：页面路由')
  res = await request('GET', '/')
  if (res.status === 200 && res.text.includes('思绪思维导图')) {
    ok('列表页访问成功')
  } else {
    fail('列表页访问失败')
  }

  // 汇总
  console.log('\n' + '='.repeat(40))
  console.log(`测试结果：✅ ${passed} 通过，❌ ${failed} 失败`)
  console.log('='.repeat(40) + '\n')

  process.exit(failed > 0 ? 1 : 0)
}

run().catch(e => {
  console.error('测试异常：', e)
  process.exit(1)
})
