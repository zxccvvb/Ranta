---
name: ranta-tee-widget
description: Ranta 插件：Vue 模板自定义标签与 extension.json 的 widget（default / provide / consume）→ page config bindings / 同页 modules / static widgets / 约定文件；模板与检索：标签可 Pascal 或 kebab，手工搜需两种形式都试。
tags: [ranta, tee, extension, widget, vue, static-widgets, provide, consume, ctx]
---

# Ranta / Tee：widget 跳转规则

与 **`src/resolveDefinition.ts`** 中 `resolveTeeWidgetDefinition` 的 **widget 分支**、**`src/extensionJsonResolve.ts`** 中 `widget.default` / `widget.provide` / `widget.consume`、**`src/widgetResolver.ts`** 中标签、page config 与索引逻辑一致。

## Vue 模板

### 驼峰（Pascal）与短横线（kebab）——查找必看

- 自定义标签名在模板里常见两种写法，**解析等价**：**PascalCase**（如 `<GoodsList />`）与 **kebab-case**（如 `<goods-list />`）。解析器会把标签统一成 **Pascal**（`tagToWidgetPascal`：`-` 分段首字母大写后拼接；无 `-` 时仅首字母大写）。
- **`extension.json` 的 `widget.default` / `provide` / `consume` 符号**、**`index.js` 里 `static widgets` 的键** 一般为 **PascalCase**；从 kebab 标签反查时，先转成 Pascal 再对 JSON / static。
- **手工在仓库里搜 widget 时**：**同时**搜 **Pascal 名** 与 **kebab 名**（例如 `GoodsList` 与 `goods-list`），避免只搜一种而漏掉另一半模板或配置。

- 光标落在 **自定义标签名**上（非内置、非 `van-*`，见 `shouldSkipTag` / `BUILTIN_TAGS`）。
- 标签名 → 大驼峰 `tagToWidgetPascal`（`-` 分段首大写；无 `-` 时仅首字母大写）。
- **解析顺序**（与实现对齐）：
  1. 若当前 extension **`widget.provide`** 含该名 → 解析本 extension 的 `static widgets` / 约定文件。
  2. 否则若当前 extension **`component.provide`** 含该名 → 走 **component**（见 **ranta-tee-component**）。
  3. 否则查找包含当前 extension 的 `ranta-config/bizs/*.page.json`，先看当前 module 的 **`bindings.widget.<Name>`**，按 `moduleId + name` 解析目标 extension。
  4. 若无显式 binding，则只在**同一 page 的 modules** 内找 `widget.provide` / `component.provide`。
  5. 同页仍无命中时，才全局枚举 `widget.provide` / `component.provide`；多命中全列。
- **多文件命中**：全部 `Location` 返回；命令 **Ranta: Go to Definition** 用 QuickPick。

## page config · `bindings`

- 模板里的 `<shop-banner />` / `<goods-group />` 这类标签，不能只按 `extension.json` 全局查同名 `provide`；必须先确定当前 Vue 文件所属 extension，再找到包含该 extension 的 `ranta-config/bizs/*.page.json`。
- 当前 page module 的 `bindings.widget.X` 优先级高于同名 `provide`。例如 `shelf-page-layout` 消费 `ShopBanner`，但页面配置里是：
  - `widget.ShopBanner -> moduleId: @retail-shelf/shop-banner 对应模块, name: Main`
  - 因此应跳到 `@retail-shelf/shop-banner` 的 `Main.vue`，而不是搜索名为 `ShopBanner` 的 provider。
- 如果没有 `bindings.widget.X`，再在同一 page 的 `modules` 里找 `widget.provide`。例如 `shelf-page-layout` 消费 `GoodsGroup`，`retail-shelf-index/index.page.json` 同页装载的是 `@retail-shelf/goods-group`，因此不能跳到另一个页面里的 `@retail-shelf/retail-goods-list/widgets/GoodsGroup.vue`。
- 只有当无法确定 page config 或同页没有 provider 时，才退回全局 provider 搜索。

## extension.json · `widget`

| 子键 | 行为 |
|------|------|
| **`default`** | 符号 → 本 extension **`index.js`** 的 **`static widgets`** 同名键 → `import` 落地文件；无 `static widgets` 时按约定找 `Main.vue` / `<Name>.vue` / `index.js`。 |
| **`provide` / `consume`** | 本 extension **`widget.provide`** 含符号则解析 **widgets**；否则优先 page config `bindings.widget.<Name>` 与同页 provider。只有找不到 page config / 同页 provider 时才允许全局兜底；多命中全列。 |

## index.js

- **`static widgets = { ... }`** 与 **`import`** 解析见 `parseStaticBlockKeys`、`resolveNamedStaticExport`。
- 部分 Tee extension 没有 `static widgets`，但有 `widget.default` 或页面 binding 指向 `Main` / `GoodsGroup`；此时按约定文件兜底：优先 `<Name>.vue/js/ts`、`widgets/<Name>.vue/js/ts`，最后在 `widget.default === <Name>` 且存在 `index.js` 时跳 `index.js`。
- `@` / `node_modules` 路径不解析。

## 相关源码

- `src/extension.ts`：Vue `DefinitionProvider` 顺序（mapData → data 属性 → 标签）
- `src/resolveDefinition.ts`：`resolveTeeWidgetDefinition`
- `src/extensionJsonResolve.ts`：`resolveStaticListSymbol`（widget，同样走 page config `bindings` 与同页 provider）
- `src/widgetResolver.ts`：`resolvePageBindingWidgetTargets`、`findPageScopedExtensionsProvidingList`、`findExtensionsProvidingList('widget', …)`、`getVueTagNameAtPosition`、`tagToWidgetPascal`
