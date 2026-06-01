---
name: ranta-tee-event
description: Ranta 插件：extension.json 的 event.emit / listen——event 属于当前 page runtime ctx；emit 优先找同页 listen 方，listen 优先找同页 emit 方；源码 `.listen`/`.emit` 首参可跳回本 extension 清单；找不到 page config 时才全局兜底。
tags: [ranta, tee, extension, event, emit, listen, ctx.event]
---

# Ranta / Tee：event 跳转规则

与 **`src/extensionJsonResolve.ts`** 中 `eventEmitCallRegex`、`eventListenCallRegex`、`resolveTeeRuntimeCodeToDefinition`，以及 **`src/widgetResolver.ts`** 中 `findExtensionsDeclaringEventListen`、`findExtensionsDeclaringEventEmit`、`findEventNameInExtensionJson` 一致。

## 作用域

- `event` 挂在 `this.ctx.event` / `ctx.event`，是当前 page 的事件总线，不是全仓全局事件总线。
- `event.emit('x')` 应优先找当前 page modules 中声明 `event.listen: ['x']` 的 extension。
- `event.listen('x')` 应优先找当前 page modules 中声明 `event.emit: ['x']` 的 extension。
- 只有无法定位 page config 或同页没有对端声明时，才允许全局兜底。

## 行为摘要

| 场景 | 行为 |
|------|------|
| **`extension.json` → `event.emit` 列表中的名称** | **①** **当前** extension 内 **`.emit('名称'`** 全部列出。**②** 优先在同页声明 **`event.listen`** 的 extension 内找 **`.listen('名称'`**，并跳到对方 **`extension.json`** 的 **`listen`** 字符串。 |
| **`extension.json` → `event.listen` 列表中的名称** | **仅对端（emit 侧）**：优先在同页声明 **`event.emit`** 的 extension 内找 **`.emit('名称'`**，并跳到对方 **`extension.json`** 的 **`emit`** 字符串。 |
| **`.vue` / `extensions/**/*.js`** → **`…event.listen('名称'`** / **`…event.emit('名称'`** 首参（光标在字符串内） | 跳到**本 extension** **`extension.json`** 对应 **`event.listen` / `event.emit`** 中的该名称（`findEventNameInExtensionJson`）。 |

## 手工检索

```bash
# 某 extension 内发出某事件（emit 侧代码）
rg "\\.emit\\s*\\(\\s*['\"]CGG:setGoodsList['\"]" path/to/extension --glob '*.{vue,js,ts}'

# 某 extension 内监听某事件（listen 侧代码）
rg "\\.listen\\s*\\(\\s*['\"]CGG:setGoodsList['\"]" path/to/extension --glob '*.{vue,js,ts}'

# 其它 extension.json 是否在 listen / emit 中声明了该名（示例：全工作区）
rg '"CGG:setGoodsList"' src/ext-tee-*/extensions --glob '**/extension.json'
```

## 相关源码

- `src/widgetResolver.ts`：`findExtensionsDeclaringEventListen`、`findExtensionsDeclaringEventEmit`、`collectExtensionJsonPaths`
- `src/extensionJsonResolve.ts`：`findEventNameInExtensionJson`、`resolveExtensionJsonDefinition`（event 分支）、`resolveTeeRuntimeCodeToDefinition`
