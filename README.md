# Ranta

> 为 **Tee / Ranta** extension 提供 **「转到定义」**：在 `extension.json` 与 `.vue` / `.js` 之间跳转 **widget / component / data / process / lambda / event**，并与 `index.js` 的 `static widgets`、`static components`、`static lambdas` 及运行时 `ctx.data` / `ctx.event` / `process` 写法对齐。

## Quick Start

### For VS Code / Cursor Users

1. 本地安装：**Developer: Install Extension from Location…** → 选择本目录；或使用 **Install from VSIX…**。
2. 打开包含 Tee extension 源码的工作区（需能访问 `extensions/<name>/extension.json` 与同目录 `index.js`）。
3. **转到定义**（`F12`）或命令 **Ranta: Go to Definition**（`Alt+F12`）：
   - **`.vue`**：`mapData(this, [ 'a', ... ])` 数组内字段、`this.ctx.data.xxx` 的字段名 → 当前 extension 的 `extension.json` 中 **data** 键；自定义 **widget 标签** → 实现文件。
   - **`extension.json`**：光标在 **双引号内的符号**上时，按下方规则跳转；**多处匹配**时编辑器列出全部，命令跳转时 **QuickPick** 选择。

## extension.json：data / event / process（摘要）

| 段 | 子键 | 跳转目标 |
|----|------|----------|
| **data** | **provide** | **当前** extension 源码：优先 `this.ctx.data.xxx` / `this.data.xxx` / `ctx.data.xxx` **赋值**（及 `['xxx']`），否则任意 `.data.xxx` **访问**。全部匹配列出。 |
| **data** | **consume** | 工作区内 **`data.provide`** 声明了该键的 **其它 extension**（对象键或数组），在各 provider 目录内按上表搜索；多 extension、多位置全部列出。 |
| **event** | **emit** | **先** **当前** extension 源码内 **`.emit('名称'`**（如 `this.ctx.event.emit(...)`）全部列出；**再**列出**其它** extension 的 **`extension.json`** 中 **`event.listen`** 声明了该名称的项（跳到对应 JSON 中的字符串）。 |
| **event** | **listen** | **先** **当前** extension 源码内 **`.listen('名称'`**（如 `this.ctx.event.listen(...)`）全部列出；**再**列出**其它** extension 的 **`extension.json`** 中 **`event.emit`** 声明了该名称的项（跳到对应 JSON 中的字符串）。 |
| **process** | **define** | **当前** extension：`process.define('名称', …)`（多种前缀）。全部匹配列出。 |
| **process** | **invoke** | **非当前** extension：`process.define('名称', …)`；优先根据全局清单中 **`process.define`** 数组定位 extension，否则在除当前外的全部 extension 目录内代码搜索。全部匹配列出。 |

**widget / component / lambda** 的 `provide` / `consume` / `default` 行为未变：本 extension `provide` 优先，否则全局枚举 `provide` 并解析 `index.js` 的 static 与 import。

## Features

| 能力 | 说明 |
| :--- | :--- |
| **索引范围** | 枚举磁盘上的 `extensions/*/extension.json`，**不依赖** VS Code 搜索索引，可覆盖被 gitignore 的目录（如 `src/ext-tee-*`）。 |
| **多命中** | `DefinitionProvider` 返回全部 `Location`；**Ranta: Go to Definition** 在多条结果时 **QuickPick**。 |
| **内置过滤** | Vue 模板中忽略常见内置标签及 `van-*`。 |

## How It Works（简要）

1. **`extension.json`**：根据缩进推断 `widget` / `data` / `process` 等段，取光标所在 **JSON 字符串**为符号名，再按上表搜索（见 `extensionJsonResolve.ts`、`extensionSearch.ts`）。
2. **Vue**：`mapData` / `this.ctx.data` → `extension.json` 的 data 键；否则解析模板标签 → widget 解析链。
3. **跨 extension**：data consume、event（emit/listen 与对端 extension.json）、process invoke 依赖全局清单或全盘 extension 根目录扫描（`widgetResolver.ts`）。

## Requirements

- VS Code **≥ 1.74.0**（或兼容的 Cursor）。
- 工作区包含 `extensions/<extension-name>/extension.json` 与入口 `index.js`（及常规 `import` 路径）。

## Development

```bash
cd Ranta
npm install
npm run compile
```

使用 **Run Extension** 调试（见 `.vscode/launch.json`）。

## 说明文档

与「转到定义」规则对应的说明可按主题查看本仓库 **`.cursor/skills/`** 下各 `SKILL.md`。

## License

[MIT](./LICENSE)
