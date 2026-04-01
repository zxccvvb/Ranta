---
name: ranta-tee-lambda
description: Ranta 插件：仅 extension.json 的 lambda.provide / consume → index.js static lambdas 与 import；无 Vue 模板标签解析；本 extension 优先再全局 lambda.provide。
tags: [ranta, tee, extension, lambda, static-lambdas, provide, consume]
---

# Ranta / Tee：lambda 跳转规则

与 **`src/extensionJsonResolve.ts`** 中 `section === 'lambda'` 的 `provide` / `consume`、**`src/widgetResolver.ts`** 中 **`static lambdas`** 一致。

## Vue 模板

- **不**从模板自定义标签解析 lambda；模板只解析 **widget** 与 **component**。

## extension.json · `lambda`

| 子键 | 行为 |
|------|------|
| **`provide` / `consume`** | 本 extension **`lambda.provide`** 含符号则解析 **lambdas**；否则全局 **`lambda.provide`**；多命中全列。 |

## index.js

- **`static lambdas = { ... }`** 与 **`import`**：`resolveNamedStaticExport(..., 'lambdas')`。
- Lambda **无法访问 `ctx`**（与 widget / process 的业务约定一致，见主 README）。

## 相关源码

- `src/extensionJsonResolve.ts`：`resolveStaticListSymbol`（`'lambda'`）
- `src/widgetResolver.ts`：`staticKindFor('lambda')`、`findExtensionsProvidingList('lambda', …)`
