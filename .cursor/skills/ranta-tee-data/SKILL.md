---
name: ranta-tee-data
description: Ranta 插件与手工排查：extension.json 的 data.provide / consume、Vue `mapData` / `this.ctx.data.xxx` 的「转到定义」规则——provide 在本 extension 搜赋值；consume 在全局 `data.provide` 声明的 extension 内搜 `this.ctx.data.xxx` 等；多命中全列。
tags: [ranta, tee, extension, data, provide, consume, ctx.data]
---

# Ranta / Tee：data 跳转规则

与本仓库 **`src/extensionJsonResolve.ts`** 中 `searchDataSymbolInExtension`、`searchDataConsumeAcrossProviders`、`findExtensionsProvidingDataKey` 一致。

## 行为摘要

| 场景 | 行为 |
|------|------|
| **`extension.json` → `data.provide` 中键名** | 仅在**当前** extension 目录内搜索：优先 `this.ctx.data.xxx` / `this.data.xxx` / `ctx.data.xxx` 的 **赋值**（含 `['xxx']`）；若无则退化为任意 **`.data.xxx` 访问**。 |
| **`extension.json` → `data.consume` 中键名** | 在工作区枚举 **`extensions/*/extension.json`**，解析 **`data.provide`**（支持 **对象键** 或 **字符串数组**），在**所有**声明了该字段的 provider extension 内执行与上表相同的搜索；**多 extension、多命中全部列出**。 |
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
