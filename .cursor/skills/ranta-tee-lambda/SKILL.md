---
name: ranta-tee-lambda
description: Ranta 插件：extension.json 的 lambda.provide / consume → index.js static lambdas 与 import；lambda 属于当前 page runtime ctx；源码 `ctx.lambdas.xxx` 方法名同等跳转；本 extension 优先，再同页 provider，最后兜底。
tags: [ranta, tee, extension, lambda, static-lambdas, provide, consume, ctx.lambdas]
---

# Ranta / Tee：lambda 跳转规则

与 **`src/extensionJsonResolve.ts`** 中 `section === 'lambda'` 的 `provide` / `consume`、`resolveTeeRuntimeCodeToDefinition`，以及 **`src/widgetResolver.ts`** 中 **`static lambdas`** 一致。

## Vue 模板

- **不**从模板自定义标签解析 lambda；模板只解析 **widget** 与 **component**。

## 作用域

- `lambda` 挂在 `this.ctx.lambdas` / `ctx.lambdas`，作用域是当前 page runtime ctx，不是全仓全局。
- `lambda.consume` 与源码里的 `ctx.lambdas.xxx` 应优先在当前 `ranta-config/bizs/*.page.json` 的 `modules` 中找 `lambda.provide`。
- 只有无法定位 page config 或同页没有 provider 时，才允许全局兜底。

## 源码（`.vue` 脚本 / `extensions/**/*.js`）

| 形态 | 行为 |
|------|------|
| **`this.ctx.lambdas.xxx`** / **`ctx.lambdas.xxx`**（光标在方法名上） | 与 **`extension.json` → `lambda.provide` / `consume`** 相同：本 extension **`lambda.provide`** 命中则 **static lambdas** + import，否则优先同页 **`lambda.provide`** provider；多命中全列。 |

## extension.json · `lambda`

| 子键 | 行为 |
|------|------|
| **`provide` / `consume`** | 本 extension **`lambda.provide`** 含符号则解析 **lambdas**；否则优先同页 **`lambda.provide`** provider，最后全局兜底；多命中全列。 |

## index.js

- **`static lambdas = { ... }`** 与 **`import`**：`resolveNamedStaticExport(..., 'lambdas')`。
- Lambda **无法访问 `ctx`**（与 widget / process 的业务约定一致，见主 README）。

## 相关源码

- `src/extensionJsonResolve.ts`：`resolveStaticListSymbol`（`'lambda'`）、`resolveTeeRuntimeCodeToDefinition`
- `src/widgetResolver.ts`：`staticKindFor('lambda')`、`findExtensionsProvidingList('lambda', …)`
