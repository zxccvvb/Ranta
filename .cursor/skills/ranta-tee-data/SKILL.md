---
name: ranta-tee-data
description: Ranta 插件与手工排查：extension.json 的 data.provide / consume、Vue `mapData` / `this.ctx.data.xxx` 的「转到定义」规则——data 属于当前 page runtime ctx；provide 在本 extension 搜赋值；consume 优先在同页 modules 的 `data.provide` provider 内搜，找不到 page config 时才全局兜底。
tags: [ranta, tee, extension, data, provide, consume, ctx.data]
---

# Ranta / Tee：data 跳转规则

与本仓库 **`src/extensionJsonResolve.ts`** 中 `searchDataSymbolInExtension`、`searchDataConsumeAcrossProviders`、`findExtensionsProvidingDataKey` 一致。

## 作用域

- `data` 不是模板组件注入，不需要 `bindings.widget.X`。
- `data` 也不应理解成全仓全局；运行时挂在 `this.ctx.data` / `ctx.data` 上，作用域是当前 `ranta-config/bizs/*.page.json` 组合出的 page。
- 排查 `data.consume` 时，优先在当前 page 的 `modules` 里找谁声明了 `data.provide`；只有无法定位 page config 时才做全局兜底。

## 行为摘要

| 场景 | 行为 |
|------|------|
| **`extension.json` → `data.provide` 中键名** | 仅在**当前** extension 目录内搜索：优先 `this.ctx.data.xxx` / `this.data.xxx` / `ctx.data.xxx` 的 **赋值**（含 `['xxx']`）；若无则退化为任意 **`.data.xxx` 访问**。 |
| **`extension.json` → `data.consume` 中键名** | 优先在当前 page 的 `modules` 中找声明了 **`data.provide`** 的 provider extension，并在 provider 内执行与上表相同的搜索；找不到 page config 时才全局兜底。 |
| **Vue `mapData(this, [ 'a', ... ])` 中字符串** | 跳到当前 extension 的 `extension.json` 里 **`data` 段**对应键 `"a":`（`findDataKeyInExtensionJson`）。 |
| **Vue `this.ctx.data.xxx` / `this.data.xxx` 的字段名** | 跳到当前 extension 的 `extension.json` 里 **`data` 段**对应键。 |

## 手工检索

```bash
rg '"yourKey"' src/ext-tee-*/extensions --glob 'extension.json'
rg "ctx\\.data\\.yourKey\\s*=" path/to/extension -n
```

## 相关源码

- `src/widgetResolver.ts`：`keysFromDataBlock`、`findExtensionsProvidingDataKey`
- `src/extensionSearch.ts`：`searchAllInExtension`
