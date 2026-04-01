---
name: ranta-tee-process
description: Ranta 插件：extension.json 的 process.define / invoke——define 在本 extension 搜 `process.define('…')`；invoke 在其它 extension 搜 define；源码 `process.define`/`invoke`/`invokePipe` 首参可跳清单或 define 实现；多命中全列。
tags: [ranta, tee, extension, process, define, invoke, ctx.process]
---

# Ranta / Tee：process 跳转规则

与 **`src/extensionJsonResolve.ts`** 中 `processDefineCallRegex`、`searchProcessDefineExternal`、`findExtensionsDefiningProcess`、`findProcessNameInExtensionJson`、`resolveTeeRuntimeCodeToDefinition` 一致。

## 行为摘要

| 场景 | 行为 |
|------|------|
| **`extension.json` → `process.define` 列表中的名称** | 仅在**当前** extension 内搜索 **`process.define('名称'`**。**多命中全部列出**。 |
| **`extension.json` → `process.invoke` 列表中的名称** | 在**非当前** extension 中搜索 **`process.define('名称'`**；优先 JSON `process.define` 命中目录，否则除当前外全盘 extension。**多命中全部列出**。 |
| **源码 → `process.define('名称'`** 首参（光标在字符串内） | 跳到**本 extension** **`extension.json`** 的 **`process.define`** 数组中该名称（`findProcessNameInExtensionJson`）。 |
| **源码 → `process.invoke` / `invokePipe` 首参** | 与 **`extension.json` → `process.invoke`** 一致：在其它 extension 搜 **`process.define('名称'`**。 |

## 相关源码

- `src/widgetResolver.ts`：`findExtensionsDefiningProcess`
- `src/extensionJsonResolve.ts`：`searchProcessDefineExternal`、`findProcessNameInExtensionJson`、`resolveTeeRuntimeCodeToDefinition`
