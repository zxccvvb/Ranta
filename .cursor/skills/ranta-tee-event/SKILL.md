---
name: ranta-tee-event
description: Ranta 插件：extension.json 的 event.emit / listen——listen 仅对端 emit 侧（各 extension 内 `.emit('…')` + 其 JSON）；emit 为当前 `.emit` + 各 listen 声明 extension 内 `.listen('…')` + JSON；源码 `.listen`/`.emit` 首参可跳回本 extension 清单；多命中全列。
tags: [ranta, tee, extension, event, emit, listen, ctx.event]
---

# Ranta / Tee：event 跳转规则

与 **`src/extensionJsonResolve.ts`** 中 `eventEmitCallRegex`、`eventListenCallRegex`、`resolveTeeRuntimeCodeToDefinition`，以及 **`src/widgetResolver.ts`** 中 `findExtensionsDeclaringEventListen`、`findExtensionsDeclaringEventEmit`、`findEventNameInExtensionJson` 一致。

## 行为摘要

| 场景 | 行为 |
|------|------|
| **`extension.json` → `event.emit` 列表中的名称** | **①** **当前** extension 内 **`.emit('名称'`** 全部列出。**②** 工作区内凡 **`event.listen`** 声明了该名称的 extension：其内 **`.listen('名称'`** 全部列出，并跳到各 **`extension.json`** 中 **`listen`** 数组里该字符串。**多命中全部列出**。 |
| **`extension.json` → `event.listen` 列表中的名称** | **仅对端（emit 侧）**：凡 **`event.emit`** 声明了该名称的 extension，其内 **`.emit('名称'`** 全部列出，并跳到各 **`extension.json`** 中 **`emit`** 数组里该字符串。**不**列当前 extension 内的 `.listen`。**多命中全部列出**。 |
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
