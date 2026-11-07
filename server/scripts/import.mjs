#!/usr/bin/env node

/**
 * MCP JSON 导入脚本
 * 用法：node import.mjs --file <json文件路径> [选项]
 *
 * 选项：
 *   --server <url>     服务地址，默认 http://localhost:8088
 *   --id <id>          指定导图 ID（覆盖已有导图）
 *   --title <title>    导图标题，默认使用文件名
 *   --source <source>  来源标识，默认 'mcp'
 *   --force            强制覆盖已有导图
 */

import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'

const args = process.argv.slice(2)

function getArg (name, defaultValue) {
  const idx = args.indexOf('--' + name)
  if (idx === -1) return defaultValue
  return args[idx + 1] || defaultValue
}

function hasFlag (name) {
  return args.includes('--' + name)
}

const file = getArg('file')
if (!file) {
  console.error('错误：必须指定 --file 参数')
  process.exit(1)
}

const server = getArg('server', 'http://localhost:8088')
const id = getArg('id', undefined)
const title = getArg('title', basename(file, extname(file)))
const source = getArg('source', 'mcp')
const force = hasFlag('force')

let data
try {
  const content = readFileSync(file, 'utf8')
  data = JSON.parse(content)
} catch (e) {
  console.error('错误：无法读取或解析 JSON 文件 -', e.message)
  process.exit(1)
}

const body = {
  title,
  data,
  source
}
if (id) body.id = id
if (force) body.force = true

async function run () {
  try {
    const res = await fetch(server + '/api/maps/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const json = await res.json()
    if (!res.ok) {
      console.error('导入失败：', json.error)
      process.exit(1)
    }
    console.log('✅ 导入成功')
    console.log('   导图 ID：', json.id)
    console.log('   标题：', json.title)
    console.log('   编辑链接：', server + '/e/' + json.id)
    console.log('   修订版本：', json.revision)
  } catch (e) {
    console.error('导入失败：', e.message)
    process.exit(1)
  }
}

run()
