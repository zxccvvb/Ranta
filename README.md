# Ranta

> 为 **Tee / Ranta** extension 提供 **「转到定义」**：在 `extension.json` 与 `.vue` / `.js` 之间跳转 **widget / component / data / process / lambda / event**，解析规则与 `index.js` 中的 `static widgets`、`static components`、`static lambdas` 及 `process.define` 等写法对齐。

## Quick Start

### For VS Code / Cursor Users

1. 本地安装：**Developer: Install Extension from Location…** → 选择仓库中的 `ranta` 目录；或使用 **Install from VSIX…**。
2. 打开包含 Tee extension 源码的工作区（需能访问 `extensions/<name>/extension.json` 与同目录 `index.js`）。
3. **转到定义**（`F12`）或命令 **Ranta: Go to Definition**（`Alt+F12`）：
   - 在 **`.vue`**：光标在 `mapData(this, [ 'a', ... ])` **数组里的字段字符串**上，或 `this.ctx.data.xxx` / `this.data.xxx` 的字段名上 → 跳到当前 extension 的 `extension.json` 里 `data` 声明；光标在自定义 **widget 标签名**上 → 跳到实现文件。
   - 在 **`extension.json`**：光标在 **双引号内的符号**上（如 `widget.provide` 里的组件名、`data.provide` 里的字段名、`process.define` 里的方法名）→ 跳到 `index.js` / `.vue` 中的实现或首次使用处。

## extension.json 结构说明

以下为 Tee extension 常见清单结构（字段可能随业务增减）：

```json
{
  "name": "my-extension",
  "version": "0.0.0",
  "platform": [],
  "displayName": "中文名",
  "description": "描述信息",
  "extensionId": "my-extension",
  "widget": {
    "default": "Main",
    "provide": [],
    "consume": []
  },
  "component": {
    "provide": [],
    "consume": []
  },
  "data": {
    "provide": {},
    "consume": {}
  },
  "event": {
    "emit": [],
    "listen": []
  },
  "process": {
    "invoke": [],
    "define": []
  },
  "lambda": {
    "provide": [],
    "consume": []
  }
}
```

### 概念对照

| 概念 | 说明 |
| :--- | :--- |
| **widget** | 页面级区块组件；在 `index.js` 中对应 `static widgets = { ... }`，**可访问 `ctx`**。 |
| **component** | 普通组件；对应 `static components = { ... }`，**无法访问 `ctx`**（与 widget 的区别）。 |
| **data** | `data.provide` / `data.consume` 声明共享数据字段及读写权限（如 `["r","w"]`）。 |
| **process** | `process.define` 注册可由 `process.invoke` 调用的方法；**可访问 `ctx`**。 |
| **lambda** | `lambda.provide` / `lambda.consume` 声明纯函数能力；**无法访问 `ctx`**（与 process 的区别）。 |
| **event** | `event.emit` / `event.listen` 声明事件名。 |

## Features

| 能力 | 说明 |
| :--- | :--- |
| **widget / component / lambda** | 在 `extension.json` 的 `provide` / `consume` 或 `widget.default` 的字符串上跳转：本 extension 在 `widget.provide`（或 `component` / `lambda` 的 `provide`）中则解析 `index.js` 的 `static *` 与 `import`；否则在工作区内查找其它 extension 的 `provide` 并解析。 |
| **data** | 在 `data.provide` / `data.consume` 的 **键名**上跳转：在 extension 内搜索 `this.data.xxx` / `this.ctx.data.xxx` / `ctx.data.xxx` 首次出现位置。在 **Vue** 中：`mapData(this, ['shopInfo', ...])` 数组内字符串、`this.ctx.data.xxx` 均可反向跳到 `extension.json` 中对应键。 |
| **process** | `process.define`：搜索 `process.define('名称', …)`；`process.invoke`：搜索 `.invoke('名称', …)`。 |
| **event** | `emit` / `listen` 列表中的名称：搜索 `emit('…')` / `listen('…')` 等首次匹配。 |
| **索引范围** | 枚举磁盘上的 `extensions/*/extension.json`，**不依赖** VS Code 搜索索引，可覆盖被 gitignore 的目录。 |
| **内置过滤** | Vue 模板中忽略常见内置标签及 `van-*`。 |

## How It Works（简要）

1. **`extension.json`**：根据缩进推断当前键属于 `widget` / `data` / `process` 等哪一段，取光标所在 **JSON 字符串**为符号名，再按上表规则在 extension 目录内搜索目标文件。  
2. **Vue**：优先解析 `this.ctx.data.xxx`；否则解析模板标签名并按 widget 规则解析。  
3. **跨 extension**：`consume` 仅声明依赖时，实现可能在其它 extension 的 `provide` 中，插件会扫描工作区内所有 extension 清单并解析对应 `index.js`。

## Requirements

- VS Code **≥ 1.74.0**（或兼容的 Cursor）。
- 工作区包含 `extensions/<extension-name>/extension.json` 与入口 `index.js`（及常规 `import` 路径）。

## Development

```bash
cd ranta
npm install
npm run compile
```

使用 **Run Extension** 调试（见 `.vscode/launch.json`）。

## License

[MIT](./LICENSE)
