---
name: ranta-tee-process
description: Ranta 插件：extension.json 的 process.define / invoke——define 在本 extension 搜 `process.define('...'; invoke 在其它 extension 搜 define（优先 JSON process.define 命中目录）；多命中全列。
tags: [ranta, tee, extension, process, define, invoke, ctx.process]
---

# Ranta / Tee：process 跳转规则

与 **`src/extensionJsonResolve.ts`** 中 `processDefineCallRegex`、`searchProcessDefineExternal`、`findExtensionsDefiningProcess` 一致。

## 行为摘要

| 场景 | 行为 |
|------|------|
| **`extension.json` → `process.define` 列表中的名称** | 仅在**当前** extension 内搜索 **`process.define('名称'`**。**多命中全部列出**。 |
| **`extension.json` → `process.invoke` 列表中的名称** | 在**非当前** extension 中搜索 **`process.define('名称'`**；优先 JSON `process.define` 命中目录，否则除当前外全盘 extension。**多命中全部列出**。 |

## 相关源码

- `src/widgetResolver.ts`：`findExtensionsDefiningProcess`
- `src/extensionJsonResolve.ts`：`searchProcessDefineExternal`
