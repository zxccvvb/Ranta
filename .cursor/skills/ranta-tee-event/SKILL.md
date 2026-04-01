---
name: ranta-tee-event
description: Ranta 插件：extension.json 的 event.emit / listen——emit 先本 extension 内 `.emit('…')`，再外部 extension.json 的 event.listen；listen 先本 extension 内 `.listen('…')`，再外部 event.emit；多命中全列。
tags: [ranta, tee, extension, event, emit, listen, ctx.event]
---

# Ranta / Tee：event 跳转规则

与 **`src/extensionJsonResolve.ts`** 中 `eventEmitCallRegex`、`eventListenCallRegex`，以及 **`src/widgetResolver.ts`** 中 `findExtensionsDeclaringEventListen`、`findExtensionsDeclaringEventEmit`、`findEventNameInExtensionJson` 一致。

## 行为摘要

| 场景 | 行为（顺序：先本 extension 源码，再外部 JSON） |
|------|----------|
| **`extension.json` → `event.emit` 列表中的名称** | **①** 仅在**当前** extension 内搜索 **`.emit('名称'`**（匹配 `ctx.event.emit` / `this.ctx.event.emit` 等）。**②** 在工作区其余 extension 中，查找 **`extension.json`** 的 **`event.listen`** 数组**声明了该名称**的项，结果为各文件内该字符串的位置。**多命中全部列出**。 |
| **`extension.json` → `event.listen` 列表中的名称** | **①** 仅在**当前** extension 内搜索 **`.listen('名称'`**（如 `this.ctx.event.listen('…')`）。**②** 在工作区其余 extension 中，查找 **`extension.json`** 的 **`event.emit`** 数组**声明了该名称**的项。**多命中全部列出**。 |

## 手工检索

```bash
# 本 extension 内发出某事件
rg "\\.emit\\s*\\(\\s*['\"]CGG:setGoodsList['\"]" path/to/current/extension --glob '*.{vue,js,ts}'

# 本 extension 内监听某事件
rg "\\.listen\\s*\\(\\s*['\"]CGG:setGoodsList['\"]" path/to/current/extension --glob '*.{vue,js,ts}'

# 其它 extension.json 是否在 listen / emit 中声明了该名（示例：全工作区）
rg '"CGG:setGoodsList"' src/ext-tee-*/extensions --glob '**/extension.json'
```

## 相关源码

- `src/widgetResolver.ts`：`findExtensionsDeclaringEventListen`、`findExtensionsDeclaringEventEmit`、`collectExtensionJsonPaths`
- `src/extensionJsonResolve.ts`：`findEventNameInExtensionJson`、`resolveExtensionJsonDefinition`（event 分支）
