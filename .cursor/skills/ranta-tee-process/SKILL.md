---
name: ranta-tee-process
description: Ranta 插件：extension.json 的 process.define / invoke——process 属于当前 page runtime ctx；define 在本 extension 搜 `process.define('…')`；invoke 优先在同页 modules 的 `process.define` provider 中找实现；源码首参可跳清单或 define 实现。
tags: [ranta, tee, extension, process, define, invoke, ctx.process]
---

# Ranta / Tee：process 跳转规则

与 **`src/extensionJsonResolve.ts`** 中 `processDefineCallRegex`、`searchProcessDefineExternal`、`findExtensionsDefiningProcess`、`findProcessNameInExtensionJson`、`resolveTeeRuntimeCodeToDefinition` 一致。

## 作用域

- `process` 挂在 `this.ctx.process` / `ctx.process`，是当前 page 的方法注册表，不是全仓全局方法表。
- `process.invoke('x')` 应优先在当前 `ranta-config/bizs/*.page.json` 的 `modules` 中找声明了 `process.define: ['x']` 的 extension。
- 只有无法定位 page config 或同页没有声明时，才允许全局兜底，避免跳到另一个页面同名 define。

## 行为摘要

| 场景 | 行为 |
|------|------|
| **`extension.json` → `process.define` 列表中的名称** | 仅在**当前** extension 内搜索 **`process.define('名称'`**。**多命中全部列出**。 |
| **`extension.json` → `process.invoke` 列表中的名称** | 优先在同页 modules 中搜索 **`process.define('名称'`**；找不到 page config 时才在非当前 extension 中兜底搜索。 |
| **源码 → `process.define('名称'`** 首参（光标在字符串内） | 跳到**本 extension** **`extension.json`** 的 **`process.define`** 数组中该名称（`findProcessNameInExtensionJson`）。 |
| **源码 → `process.invoke` / `invokePipe` 首参** | 与 **`extension.json` → `process.invoke`** 一致：优先同页 provider，再兜底搜索其它 extension。 |

## 相关源码

- `src/widgetResolver.ts`：`findExtensionsDefiningProcess`
- `src/extensionJsonResolve.ts`：`searchProcessDefineExternal`、`findProcessNameInExtensionJson`、`resolveTeeRuntimeCodeToDefinition`
