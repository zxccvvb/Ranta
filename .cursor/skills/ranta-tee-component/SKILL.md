---
name: ranta-tee-component
description: Ranta 插件：Vue 模板标签在 component.provide 命中时 → index.js static components；extension.json 的 component provide/consume；本 extension 优先再全局 component.provide；多命中全列。模板与检索：同一组件可写 Pascal 驼峰或 kebab 短横线，手工搜需两种形式都试。
tags: [ranta, tee, extension, component, vue, static-components, provide, consume]
---

# Ranta / Tee：component 跳转规则

与 **`src/resolveDefinition.ts`** 中 `resolveTeeWidgetDefinition` 的 **component 分支**、**`src/extensionJsonResolve.ts`** 中 `component.provide` / `component.consume`、**`src/widgetResolver.ts`** 一致。

## Vue 模板

### 驼峰（Pascal）与短横线（kebab）——查找必看

- 同一组件在模板里常见两种写法，**语义等价**、解析会归一到同一符号（与 `tagToWidgetPascal` 一致）：**PascalCase**（如 `<GoodsItem />`、`<GroupNavHorizontal />`）与 **kebab-case**（如 `<goods-item />`、`<group-nav-horizontal />`）。
- **`extension.json` 的 `component.provide` / `consume` 键**、**`index.js` 里 `static components` 的键** 一般为 **PascalCase**；若模板里只有短横线标签，先把短横线分段转 Pascal 再对照 JSON / static。
- **手工在仓库里搜组件时**：不要只搜一种命名——**同时**搜 **Pascal 名** 与 **对应的 kebab 名**（`-` 连接、全小写分段），以免漏掉模板引用或遗漏 `provide` 声明。

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
