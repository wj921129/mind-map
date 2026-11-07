import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// 根目录 package.json 已声明 type: module，因此这里使用 ESM 语法
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const src = path.resolve(__dirname, './dist/index.html')
const dest = path.resolve(__dirname, './index.html')

if (fs.existsSync(dest)) {
  fs.unlinkSync(dest)
}

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest)
  fs.unlinkSync(src)
}

// console.warn('请检查付费插件是否启用！！！')
