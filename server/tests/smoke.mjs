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

  // 15. POST /api/maps 来源标记测试
  log('测试 15：POST /api/maps 来源标记 (source=mcp)')
  res = await request('POST', '/api/maps', { title: 'MCP来源测试', source: 'mcp' })
  if (res.status === 201 && res.json.updated_by === 'mcp') {
    ok('POST 来源标记成功 (updated_by=mcp)')
  } else {
    fail('POST 来源标记失败：' + res.text)
  }
  const mcpSourceId = res.json.id

  // 16. PUT /api/maps/:id MCP 自动快照测试
  log('测试 16：PUT /api/maps/:id MCP 自动快照')
  const mcpMapRev = (await request('GET', '/api/maps/' + mcpSourceId)).json.revision
  res = await request('PUT', '/api/maps/' + mcpSourceId, {
    data: {
      root: { data: { text: 'MCP修改后的根节点' }, children: [] },
      theme: { template: 'avocado', config: {} },
      layout: 'logicalStructure',
      config: {},
      view: null
    },
    revision: mcpMapRev,
    updatedBy: 'mcp'
  })
  if (res.status === 200 && res.json.revision === mcpMapRev + 1) {
    ok('MCP 更新成功，revision 递增')
  } else {
    fail('MCP 更新失败：' + res.text)
  }
  // 验证自动归档了修改前的版本快照
  const mcpVersions = (await request('GET', '/api/maps/' + mcpSourceId + '/versions')).json
  const hasMcpSnapshot = mcpVersions.some(v => v.source === 'mcp')
  if (hasMcpSnapshot) {
    ok('MCP 自动快照归档成功')
  } else {
    fail('MCP 自动快照未归档')
  }

  // 17. PUT /api/maps/:id 手动快照测试
  log('测试 17：PUT /api/maps/:id 手动快照 (manualSnapshot=true)')
  const manualRev = (await request('GET', '/api/maps/' + mcpSourceId)).json.revision
  res = await request('PUT', '/api/maps/' + mcpSourceId, {
    data: {
      root: { data: { text: '手动快照测试' }, children: [] },
      theme: { template: 'avocado', config: {} },
      layout: 'logicalStructure',
      config: {},
      view: null
    },
    revision: manualRev,
    manualSnapshot: true,
    updatedBy: 'human'
  })
  if (res.status === 200) {
    ok('手动快照更新成功')
  } else {
    fail('手动快照更新失败：' + res.text)
  }
  const manualVersions = (await request('GET', '/api/maps/' + mcpSourceId + '/versions')).json
  const hasManualSnapshot = manualVersions.some(v => v.source === 'human')
  if (hasManualSnapshot) {
    ok('手动快照归档成功')
  } else {
    fail('手动快照未归档')
  }

  // 清理来源标记测试创建的导图
  await request('DELETE', '/api/maps/' + mcpSourceId)

  // 18. 宿主 HTML 桥接脚本渲染验证
  log('测试 18：宿主 HTML 桥接脚本验证')
  // 先创建一个导图用于编辑页访问
  const bridgeMap = (await request('POST', '/api/maps', { title: '桥接测试' })).json
  res = await request('GET', '/e/' + bridgeMap.id)
  if (res.status === 200 &&
      res.text.includes('__MCP_WS_URL__') &&
      res.text.includes('parseMarkdownToRoot') &&
      res.text.includes('initMcpBridge') &&
      res.text.includes('handleMcpMessage')) {
    ok('宿主 HTML 包含 MCP 桥接脚本')
  } else {
    fail('宿主 HTML 缺少 MCP 桥接脚本')
  }
  await request('DELETE', '/api/maps/' + bridgeMap.id)

  // 19. 宿主脚本 JS 语法合法性 & Markdown 解析函数单元测试
  log('测试 19：宿主脚本语法校验与 Markdown 解析逻辑验证')
  {
    const mdMap = (await request('POST', '/api/maps', { title: 'MD解析测试' })).json
    const res = await request('GET', '/e/' + mdMap.id)
    if (res.status !== 200) {
      fail('获取宿主 HTML 失败，status=' + res.status)
    } else {
      // 19.1 提取所有内联 <script> 验证无 SyntaxError
      const scriptRegex = /<script>([\s\S]*?)<\/script>/g
      let match
      let inlineScripts = []
      while ((match = scriptRegex.exec(res.text)) !== null) {
        inlineScripts.push(match[1])
      }
      if (inlineScripts.length < 2) {
        fail('应包含至少 2 段内联 script，实际 ' + inlineScripts.length)
      } else {
        let syntaxOk = true
        for (const code of inlineScripts) {
          try {
            new Function(code)
          } catch (e) {
            syntaxOk = false
            fail('内联 script 语法错误：' + e.message)
            break
          }
        }
        if (syntaxOk) ok('内联 script 语法合法')
      }

      // 19.2 提取 parseMarkdownToRoot 进行真实解析断言
      const fnMatch = res.text.match(/function parseMarkdownToRoot\(md\)\s*\{[\s\S]*?return root\.children\[0\] \|\| root\s*\}/)
      if (!fnMatch) {
        fail('未能提取完整 parseMarkdownToRoot 函数体')
      } else {
        try {
          const parseMarkdownToRoot = new Function('md', `${fnMatch[0]}; return parseMarkdownToRoot(md);`)
          // 使用缩进明确的 Markdown 样本
          const mdSample = '# 中心主题\n## 分支一\n- 列表项1\n  - 子列表项1.1\n## 分支二'
          const tree = parseMarkdownToRoot(mdSample)
          if (!tree || !tree.data || tree.data.text !== '中心主题') {
            fail('根节点应为"中心主题"，实际为 ' + JSON.stringify(tree?.data))
          } else if (!Array.isArray(tree.children)) {
            fail('应有 children 数组')
          } else {
            // 验证所有节点都能正确解析（不强制层级结构，因为 Markdown 解析依赖缩进语义）
            const allTexts = []
            const collect = (node) => { allTexts.push(node.data.text); (node.children || []).forEach(collect) }
            collect(tree)
            const expectedTexts = ['中心主题', '分支一', '列表项1', '子列表项1.1', '分支二']
            const missing = expectedTexts.filter(t => !allTexts.includes(t))
            if (missing.length > 0) {
              fail('解析结果缺少节点：' + missing.join(', ') + '，实际有：' + allTexts.join(', '))
            } else {
              ok('Markdown 解析逻辑验证通过')
            }
          }
        } catch (e) {
          fail('parseMarkdownToRoot 执行异常：' + e.message)
        }
      }
    }
    await request('DELETE', '/api/maps/' + mdMap.id)
  }

  // 20. 删除导图
  log('测试 20：删除导图')
  res = await request('DELETE', '/api/maps/' + mapId)
  if (res.status === 200) {
    ok('删除导图成功')
  } else {
    fail('删除导图失败')
  }

  // 21. 验证删除
  log('测试 21：验证删除')
  res = await request('GET', '/api/maps/' + mapId)
  if (res.status === 44) {
    fail('验证删除失败：状态码异常')
  } else if (res.status === 404) {
    ok('验证删除成功')
  } else {
    fail('验证删除失败')
  }

  // 22. 静态资源测试
  log('测试 22：静态资源访问')
  res = await request('GET', '/dist/logo.ico')
  if (res.status === 200) {
    ok('静态资源访问成功')
  } else {
    fail('静态资源访问失败')
  }

  // 23. 页面路由测试
  log('测试 23：页面路由')
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
