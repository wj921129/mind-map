# 项目规则与简述 (Simple Mind Map)

## 一、项目简述

本项目为 **Simple Mind Map（思绪思维导图）**，是一个 Web 思维导图库及 Web 应用。主要由两部分构成：
1. **核心库 (`simple-mind-map/`)**：纯 JavaScript 实现的思维导图核心引擎库，不依赖任何前端框架，提供节点渲染、布局算法、事件系统、插件机制与数据导入导出等核心能力。
2. **Web 演示应用 (`web/`)**：基于 `Vue 2.x` + `ElementUI` + `Webpack` 构建的完整思维导图单页应用 (SPA)，提供丰富的主题、工具栏、侧边栏、快捷键及本地文件读写支持。

---

## 二、项目级规则与红线

### 1. 禁用规范守卫（绝对红线）
- **严禁触发 `front-code-guard` 与 `front-code-review`**：
  - 本项目为现代前端 SPA（Vue 2.x + ES6+）及现代化前端库，**非**传统后端模板工程（如 Thymeleaf/jQuery 架构）。
  - 在阅读、定位、编写、修改或审查本项目的前端代码（`.vue` / `.js` / `.css` / `.less` / `.html`）时，**一律严禁触发或挂载 `front-code-guard` 以及 `front-code-review`**。
  - **严禁**强套 `front-code-guard` 中的 ES5 语法限制、jQuery 工具复用、`common.js` / `main.css` 目录规范或相关档位派检流程。

### 2. 代码开发与修改约束
- **保持技术栈范式**：遵循项目既有的 Vue 2.x Options API、ES6+ 模块化语法及 ElementUI 交互范式，风格与上下文保持一致。
- **最小化改动**：遵循局部可逆与精准修改原则，禁止无关代码的“顺手重构”或全量格式化。
- **安全与授权**：代码提交（git commit/push）、版本发布、破坏性清理等高危动作，必须经过老板明确授权方可执行。
