# Ranta

> 为 **Tee / Ranta** extension 提供 **「转到定义」**：在 `extension.json` 与 `.vue` / `.js` 之间跳转 **widget / component / data / process / lambda / event**，并与 `index.js` 的 `static widgets`、`static components`、`static lambdas` 及运行时 `ctx.data` / `ctx.event` / `process` / `ctx.lambdas` 写法对齐。

## Quick Start

### For VS Code / Cursor Users

1. 本地安装：**Developer: Install Extension from Location…** → 选择本目录；或使用 **Install from VSIX…**。
2. 打开包含 Tee extension 源码的工作区（需能访问 `extensions/<name>/extension.json` 与同目录 `index.js`）。
3. **转到定义**（`F12`）或命令 **Ranta: Go to Definition**（`Alt+F12`）：
   - **`.vue`**：`mapData(this, [ 'a', ... ])` 数组内字段、`this.ctx.data.xxx` 的字段名 → 当前 extension 的 `extension.json` 中 **data** 键；**`this.ctx.event.listen` / `emit` 首参**、**`process.define` / `invoke` / `invokePipe` 首参**、**`this.ctx.lambdas.xxx` 方法名** → 见下表；自定义 **widget 标签** → 实现文件。
   - **`extensions/**` 下的 `.js` / `.ts`**：同上（event / process / lambda），由扩展单独注册，便于在 `index.js` 等文件中从 **`process.define('…')`** 跳回 **`extension.json`**。
   - **`extension.json`**：光标在 **双引号内的符号**上时，按下方规则跳转；**多处匹配**时编辑器列出全部，命令跳转时 **QuickPick** 选择。

## extension.json：data / event / process（摘要）

| 段 | 子键 | 跳转目标 |
|----|------|----------|
| **data** | **provide** | **当前** extension 源码：优先 `this.ctx.data.xxx` / `this.data.xxx` / `ctx.data.xxx` **赋值**（及 `['xxx']`），否则任意 `.data.xxx` **访问**。全部匹配列出。 |
| **data** | **consume** | 工作区内 **`data.provide`** 声明了该键的 **其它 extension**（对象键或数组），在各 provider 目录内按上表搜索；多 extension、多位置全部列出。 |
| **event** | **emit** | **①** **当前** extension 内 **`.emit('名称'`** 全部列出；**②** 工作区内凡 **`extension.json`** 的 **`event.listen`** 声明了该名称的 extension：其源码中 **`.listen('名称'`** 全部列出，并包含各 **`extension.json`** 中该字符串位置。**多命中全部列出**。 |
| **event** | **listen** | **不**再列当前 extension 内的 `.listen`；仅 **对端**：凡 **`event.emit`** 声明了该名称的 extension，其源码中 **`.emit('名称'`** 全部列出，并包含各 **`extension.json`** 中 **`event.emit`** 里该字符串位置。**多命中全部列出**。 |
| **process** | **define** | **当前** extension：`process.define('名称', …)`（多种前缀）。全部匹配列出。 |
| **process** | **invoke** | **非当前** extension：`process.define('名称', …)`；优先根据全局清单中 **`process.define`** 数组定位 extension，否则在除当前外的全部 extension 目录内代码搜索。全部匹配列出。 |

**widget / component / lambda** 的 `provide` / `consume` / `default` 行为未变：本 extension `provide` 优先，否则全局枚举 `provide` 并解析 `index.js` 的 static 与 import。

## 源码 → extension.json（反向）

在 **当前文件属于某 Tee extension**（向上能解析到 `extension.json`）时，**转到定义**可从源码跳到清单：

| 源码形态 | 目标 |
|----------|------|
| **`…event.listen('名称'`** 首参 | 本 extension **`extension.json`** → **`event.listen`** 中该名称 |
| **`…event.emit('名称'`** 首参 | 本 extension **`event.emit`** 中该名称 |
| **`…process.define('名称'`** 首参 | 本 extension **`process.define`** 中该名称 |
| **`…process.invoke(…` / `invokePipe(…`** 首参 | 与 **`extension.json` → `process.invoke`** 一致：在 **其它** extension 搜 **`process.define('名称'`** |
| **`this.ctx.lambdas.xxx` / `ctx.lambdas.xxx`** 方法名 | 与 **`lambda.provide`** 一致：解析 **static lambdas** 与 import |

## Features

| 能力 | 说明 |
| :--- | :--- |
| **索引范围** | 枚举磁盘上的 `extensions/*/extension.json`，**不依赖** VS Code 搜索索引，可覆盖被 gitignore 的目录（如 `src/ext-tee-*`）。 |
| **多命中** | `DefinitionProvider` 返回全部 `Location`；**Ranta: Go to Definition** 在多条结果时 **QuickPick**。 |
| **内置过滤** | Vue 模板中忽略常见内置标签及 `van-*`。 |

## How It Works（简要）

1. **`extension.json`**：根据缩进推断 `widget` / `data` / `process` 等段，取光标所在 **JSON 字符串**为符号名，再按上表搜索（见 `extensionJsonResolve.ts`、`extensionSearch.ts`）。
2. **Vue**：`mapData` / `this.ctx.data` → `extension.json` 的 data 键；**event / process / lambda** 见 `resolveTeeRuntimeCodeToDefinition`；否则解析模板标签 → widget 解析链。
3. **`extensions/**/*.js|ts`**：`resolveTeeRuntimeCodeToDefinition`（与 Vue 脚本内规则一致）。
4. **跨 extension**：data consume、event（listen ↔ 对端 emit 的声明 extension 内代码 + JSON）、process invoke 依赖全局清单或全盘 extension 根目录扫描（`widgetResolver.ts`）。

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
