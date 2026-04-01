---
name: ranta-quick-find
description: 与 Ranta VS Code 插件（ranta.goToWidget / Alt+F12 / DefinitionProvider）源码逻辑一致：Vue 内 mapData、data 访问、模板标签；extension.json 内 widget/component/lambda/data/process/event；index.js 的 static widgets|components|lambdas 与 import 解析；全局枚举 extensions/**/extension.json。用于 wsc 中 ext-tee-*、extensions 下「跳到定义」的手工复现与排查。
---

# Ranta / Tee：转到定义（与插件源码一致）

本说明对齐仓库内 **`Ranta_副本`** 中的实现，核心文件：

| 文件 | 职责 |
|------|------|
| `extension.ts` | 命令 `ranta.goToWidget`、Vue / extension.json 的 `DefinitionProvider`、**解析优先级** |
| `resolveDefinition.ts` | `resolveTeeWidgetDefinition`（模板标签 → widget **或** component） |
| `extensionJsonResolve.ts` | `extension.json` 内字符串、`mapData`、`this.data.xxx` 等 |
| `extensionJsonContext.ts` | `inferExtensionJsonContext`、`getJsonStringAtPosition` |
| `widgetResolver.ts` | `tagToWidgetPascal`、`shouldSkipTag`、`findExtensionRootAsync`、index.js 解析、**全局 provide 扫描** |

---

## 1. IDE 内（首选）

- 命令：**Ranta: Go to Definition**（`ranta.goToWidget`）
- 快捷键：**Alt+F12**（需在 Vue 或 `**/extensions/**/extension.json` 编辑器内）
- 也可使用编辑器自带 **转到定义**（已注册 `DefinitionProvider`）

---

## 2. Vue 文件：解析优先级（严格顺序）

插件对 **同一光标** 按以下顺序尝试，**命中即返回**（见 `extension.ts` 的 `provideDefinition` / `goToDefinitionAtCursor`）：

1. **`mapData(this, [ ... ])`**  
   - 光标须在 **`mapData(this, [` 与配对 `]`** 构成的数组字面量范围内。  
   - 光标落在某个 **字符串字面量**（`'key'` / `"key"`）上，且为合法标识符。  
   - 目标：当前文件向上找到的 **extension 根目录** 下 `extension.json` 里 **data** 段中 **`"key":`** 所在位置（`findDataKeyInExtensionJson`）。

2. **`this.data.xxx` / `this.ctx.data.xxx` / `ctx.data.xxx`**  
   - 光标须在 **属性名 `xxx`** 上（正则匹配行内上述三种前缀之一）。  
   - 目标：同上，`extension.json` 里对应 data 键。

3. **模板自定义标签**（非跳过标签）  
   - 见下文 **§3**（`resolveTeeWidgetDefinition`）。

若均失败，插件会提示未解析到目标。

---

## 3. Vue 模板：标签 → 实现文件

### 3.1 取标签名

- 与 `getVueTagNameAtPosition` 一致：当前行内匹配 `<tag` 或 `</tag` 上的 **`[A-Za-z][A-Za-z0-9-]*`**，光标须落在**标签名字符**上。

### 3.2 标签名 → 符号名 `tagToWidgetPascal`

- 去首尾空白后：
  - **含 `-`**：按 `-` 分段，每段 **首字母大写、其余小写**，再拼接（`scan-goods-sku` → `ScanGoodsSku`）。
  - **不含 `-`**：**首字母大写，其余不变**（兼容 `ScanComboDetail` / `scanComboDetail`）。

### 3.3 跳过标签 `shouldSkipTag`

- **`van-` 前缀**（不区分大小写）：跳过（Vant）。
- **内置标签集合** `BUILTIN_TAGS`：**匹配时用 `tag.toLowerCase()`**（见下文 **附录** 全表）。另含 Vue 内置与 **微信小程序** 标签。

### 3.4 `resolveTeeWidgetDefinition`（模板 → 源码）

**重要：模板标签只解析为 `widget` 或 `component`，不包含 `lambda`。**

1. **找 extension 根**：从当前 Vue 文件路径 **向上** 直到存在 **`extension.json`** 的目录（`findExtensionRootAsync`）。

2. **本 extension 优先**：读取该目录 `extension.json`  
   - 若 **`widget.provide`** 含该 Pascal 名 → 解析同目录 **`index.js`** 的 **`static widgets`** 中同名键，经 **import** 落到文件（`resolveNamedStaticExport(..., 'widgets')`）。  
   - 否则若 **`component.provide`** 含该名 → 同上，**`static components`**（`'components'`）。

3. **全局阶段**（本 extension 的 provide 未命中或解析失败时）：在工作区 **磁盘遍历** 枚举 **`.../extensions/<任意名>/extension.json`**（不依赖 VS Code 索引，**可扫到被 ignore 的 `src/ext-tee-*`**），查找：  
   - **`widget.provide`** 含该名 → 各命中 extension 的 **`static widgets`**；  
   - **`component.provide`** 含该名 → 各命中 extension 的 **`static components`**。  
   - 去重后若 **多个文件**，插件 **QuickPick** 让用户选。

**跨 extension**：仅在 **`consume`** 中声明、由其它包 **provide** 的符号，必须做 **全局 provide 搜索**，不能只查当前 `extension.json`。

---

## 4. `index.js`：import 与 static 块（与插件解析一致）

### 4.1 Import

- `import Foo from 'path'`  
- `import { A, B as C } from 'path'`（`parseIndexJsImports`）

### 4.2 Static 块标记

三选一（键名与 `provide` 字符串一致）：

- `static widgets`
- `static components`
- `static lambdas`

块体为 **`=` 后第一个 `{` 到配对 `}`**，内部按行/逗号拆分，识别 **`Name:`** 或 **`Name`** 简写（`parseStaticBlockKeys`）。

### 4.3 路径解析 `resolveImportToFile`

- **`@` 开头**或路径含 **`node_modules`**：**不解析**（返回 undefined）。
- 否则相对 **extension 根目录** 尝试：`path`、`path.vue`、`path.js`、`path.ts`、`path/index.vue`、`path/index.js` 等。

---

## 5. `extension.json`：光标在字符串上（双引号内）

### 5.1 前置条件

- 文件匹配：`**/extensions/**/extension.json`。
- 光标须在 **双引号包裹的 JSON 字符串**内（`getJsonStringAtPosition` 仅匹配 **`"..."`**）。
- 该字符串不能属于 **保留字**（不跳转）：`provide`、`consume`、`define`、`invoke`、`emit`、`listen`、`default`、`widget`、`component`、`data`、`lambda`、`process`、`event`（`RESERVED_SYMBOLS`）。

### 5.2 上下文推断 `inferExtensionJsonContext`

- 从文件开头扫描到**当前行**：  
  - **顶层 section**（行首约 **2 空格**）：`"widget"|"component"|"data"|"lambda"|"process"|"event"`。  
  - **子键**（约 **4 空格**）：`provide`、`consume`、`define`、`invoke`、`emit`、`listen`；**仅 `widget` 下**可有 **`default`**。

### 5.3 各上下文行为 `resolveExtensionJsonDefinition`

| 上下文 | 行为 |
|--------|------|
| **`widget` + `default`** | 符号 → 本 extension `index.js` 的 **`static widgets`** 中同名 → import 文件 |
| **`widget` / `component` / `lambda` + `provide` 或 `consume`** | 与模板全局逻辑类似：**先**看本 extension 对应段的 **`provide`** 是否包含该符号；命中则解析 **widgets / components / lambdas**；**否则**全局搜索该 **`section.provide`**，再解析各 `index.js`（`resolveStaticListSymbol`） |
| **`data` + `provide` 或 `consume`** | 在 **当前 extension 目录** 下源码（浅层递归 `.vue/.js/.ts/...`）中搜 **首处** 匹配：`(this.data\|this.ctx.data\|ctx.data).<symbol>\b` |
| **`process` + `define`** | 搜：`(.ctx.)?process` 上 `define('符号'` |
| **`process` + `invoke`** | 搜：`.invoke('符号'` |
| **`event` + `emit` 或 `listen`** | 搜：`.emit(` / `.listen(` / `emit` / `listen` 等与 `('符号'` |

---

## 6. 全局枚举 `extension.json` 路径（与插件一致）

- 递归工作区目录，跳过 `node_modules`、`.git`、`dist`、`out`、`.next`、`build`、`coverage`、`miniprogram_npm` 等。  
- 仅当 **`extension.json` 的父目录的父目录名为 `extensions`** 时计入（即路径形如 **`.../extensions/<extName>/extension.json`**）。  
- 因此手工检索可用：  
  `rg 'YourSymbol' src/ext-tee-*/extensions --glob 'extension.json'`  
  并结合 **`provide`** 与 **`index.js`** 中 static 块。

---

## 7. 多命中与边界

- **同名 widget/component** 多个 extension 提供：插件 **列出路径任选**；手工需结合业务或全仓 `rg`。  
- **`index.js` 缺少 import**、或 static 中无对应键：无法落地文件。  
- **JSONC / 非标准缩进**：上下文推断依赖 **2/4 空格** 约定，异常缩进可能导致 extension.json 内跳转失败。  
- **Lambda**：**仅**在 `extension.json` 的 **lambda.provide/consume** 字符串或 **static lambdas** 链路中处理；**不会**作为 Vue 模板标签解析目标。

---

## 8. 手工检索速查

```bash
# 某 Pascal 符号在哪些 extension.json 出现（再区分 provide / consume）
rg 'YourPascalName' src/ext-tee-*/extensions --glob 'extension.json'

# 定位到 extension 目录后，始终打开同目录 index.js，查 static widgets | components | lambdas 与 import
```

定位到 **`extension.json`** 后：**打开同目录 `index.js`** → 在对应 **`static *`** 中找到 **与符号同名** 的键 → 沿 **同名 import** 解析到 **`.vue` / `.js`**。

---

## 附录：`BUILTIN_TAGS` 全表（与 `Ranta_副本/src/widgetResolver.ts` 一致）

以下标签名经 **小写** 后若命中集合则 **`shouldSkipTag` 为 true**（不跳转）。`van-` 前缀另见 §3.3。

```
template
script
style
slot
component
transition
keep-alive
router-view
router-link
view
scroll-view
swiper
swiper-item
movable-view
movable-area
cover-view
cover-image
icon
text
rich-text
progress
button
checkbox
form
input
label
picker
picker-view
radio
slider
switch
textarea
navigator
audio
image
video
camera
live-player
live-pusher
map
canvas
web-view
block
open-data
official-account
editor
ad
page-meta
navigation-bar
match-media
root-portal
page-container
```

共 **52** 项（与源码数组长度一致）。
