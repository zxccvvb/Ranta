---
name: ranta-tee-widget
description: Ranta 插件：Vue 模板自定义标签与 extension.json 的 widget（default / provide / consume）→ index.js static widgets 与 import；本 extension provide 优先，否则全局枚举 widget.provide；多 extension 同名时全列。模板与检索：标签可 Pascal 或 kebab，手工搜需两种形式都试。
tags: [ranta, tee, extension, widget, vue, static-widgets, provide, consume, ctx]
---

# Ranta / Tee：widget 跳转规则

与 **`src/resolveDefinition.ts`** 中 `resolveTeeWidgetDefinition` 的 **widget 分支**、**`src/extensionJsonResolve.ts`** 中 `widget.default` / `widget.provide` / `widget.consume`、**`src/widgetResolver.ts`** 中标签与索引逻辑一致。

## Vue 模板

### 驼峰（Pascal）与短横线（kebab）——查找必看

- 自定义标签名在模板里常见两种写法，**解析等价**：**PascalCase**（如 `<GoodsList />`）与 **kebab-case**（如 `<goods-list />`）。解析器会把标签统一成 **Pascal**（`tagToWidgetPascal`：`-` 分段首字母大写后拼接；无 `-` 时仅首字母大写）。
- **`extension.json` 的 `widget.default` / `provide` / `consume` 符号**、**`index.js` 里 `static widgets` 的键** 一般为 **PascalCase**；从 kebab 标签反查时，先转成 Pascal 再对 JSON / static。
- **手工在仓库里搜 widget 时**：**同时**搜 **Pascal 名** 与 **kebab 名**（例如 `GoodsList` 与 `goods-list`），避免只搜一种而漏掉另一半模板或配置。

- 光标落在 **自定义标签名**上（非内置、非 `van-*`，见 `shouldSkipTag` / `BUILTIN_TAGS`）。
- 标签名 → 大驼峰 `tagToWidgetPascal`（`-` 分段首大写；无 `-` 时仅首字母大写）。
- **解析顺序**（与实现对齐）：若当前 extension **`widget.provide`** 含该名 → `static widgets` + `import`；否则若 **`component.provide`** 含该名 → 走 **component**（见 **ranta-tee-component**）；否则 **全局** 扫 `widget.provide`，再 `static widgets`；仍无则再扫 **component**（全局 `component.provide`）。
- **多文件命中**：全部 `Location` 返回；命令 **Ranta: Go to Definition** 用 QuickPick。

## extension.json · `widget`

| 子键 | 行为 |
|------|------|
| **`default`** | 符号 → 本 extension **`index.js`** 的 **`static widgets`** 同名键 → `import` 落地文件。 |
| **`provide` / `consume`** | 本 extension **`widget.provide`** 含符号则解析 **widgets**；否则全局 **`widget.provide`**，同上；多命中全列。 |

## index.js

- **`static widgets = { ... }`** 与 **`import`** 解析见 `parseStaticBlockKeys`、`resolveNamedStaticExport`。
- `@` / `node_modules` 路径不解析。

## 相关源码

- `src/extension.ts`：Vue `DefinitionProvider` 顺序（mapData → data 属性 → 标签）
- `src/resolveDefinition.ts`：`resolveTeeWidgetDefinition`
- `src/extensionJsonResolve.ts`：`resolveStaticListSymbol`（widget）
- `src/widgetResolver.ts`：`findExtensionsProvidingList('widget', …)`、`getVueTagNameAtPosition`、`tagToWidgetPascal`
