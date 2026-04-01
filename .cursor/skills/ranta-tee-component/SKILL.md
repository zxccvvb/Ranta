---
name: ranta-tee-component
description: Ranta 插件：Vue 模板标签在 component.provide 命中时 → index.js static components；extension.json 的 component provide/consume；本 extension 优先再全局 component.provide；多命中全列。
tags: [ranta, tee, extension, component, vue, static-components, provide, consume]
---

# Ranta / Tee：component 跳转规则

与 **`src/resolveDefinition.ts`** 中 `resolveTeeWidgetDefinition` 的 **component 分支**、**`src/extensionJsonResolve.ts`** 中 `component.provide` / `component.consume`、**`src/widgetResolver.ts`** 一致。

## Vue 模板

- 与 **widget** 共用同一套标签解析（`resolveTeeWidgetDefinition`）。
- **顺序**：先查当前 extension **`widget.provide`**；未命中再查 **`component.provide`** → **`static components`** + `import`；再 **全局** `widget.provide`，再 **全局** `component.provide`。
- 因此：**仅出现在 `component.provide`、不在 `widget.provide`** 的 Pascal 名，仍通过模板标签跳转，但走的是 **components** 链路。
- **不会**单独作为「lambda」解析；lambda 无模板入口（见 **ranta-tee-lambda**）。

## extension.json · `component`

| 子键 | 行为 |
|------|------|
| **`provide` / `consume`** | 本 extension **`component.provide`** 含符号则解析 **components**；否则全局 **`component.provide`**；多命中全列。 |

## index.js

- **`static components = { ... }`** 与 **`import`**：`resolveNamedStaticExport(..., 'components')`。

## 相关源码

- `src/resolveDefinition.ts`：`resolveTeeWidgetDefinition`（component 命中与全局 `componentHits`）
- `src/extensionJsonResolve.ts`：`resolveStaticListSymbol`（section === `'component'`）
- `src/widgetResolver.ts`：`findExtensionsProvidingList('component', …)`
