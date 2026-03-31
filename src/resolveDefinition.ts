import * as vscode from 'vscode';
import {
  findExtensionRootAsync,
  findExtensionsProvidingList,
  readExtensionJson,
  resolveNamedStaticExport,
} from './widgetResolver';

/**
 * 解析 Vue 模板标签对应的实现（widget 或 component）：
 * 1. 本 extension 的 widget.provide / component.provide 命中 → 解析 index.js 中 static widgets / static components。
 * 2. 否则在工作区内搜索任意 extension.json 的 widget.provide 与 component.provide，再解析对应 index.js。
 *
 * 说明：仅在 consume 中声明的组件（如 retail-goods-list 的 component.consume）实现位于其它 extension 的 provide，
 * 因此全局阶段必须同时查找 component.provide（不能只查 widget）。
 */
export async function resolveTeeWidgetDefinition(
  fromFile: vscode.Uri,
  namePascal: string
): Promise<vscode.Location[] | undefined> {
  const extRoot = await findExtensionRootAsync(fromFile);
  if (extRoot) {
    const meta = await readExtensionJson(extRoot);
    const widgetProvides = meta?.widget?.provide ?? [];
    const componentProvides = meta?.component?.provide ?? [];

    if (widgetProvides.includes(namePascal)) {
      const target = await resolveNamedStaticExport(
        extRoot,
        namePascal,
        'widgets'
      );
      if (target) {
        return [new vscode.Location(target, new vscode.Range(0, 0, 0, 0))];
      }
    }
    if (componentProvides.includes(namePascal)) {
      const target = await resolveNamedStaticExport(
        extRoot,
        namePascal,
        'components'
      );
      if (target) {
        return [new vscode.Location(target, new vscode.Range(0, 0, 0, 0))];
      }
    }
  }

  const locations: vscode.Location[] = [];
  const seen = new Set<string>();

  const widgetHits = await findExtensionsProvidingList('widget', namePascal);
  for (const hit of widgetHits) {
    const target = await resolveNamedStaticExport(
      hit.extensionRoot,
      namePascal,
      'widgets'
    );
    if (target && !seen.has(target.fsPath)) {
      seen.add(target.fsPath);
      locations.push(
        new vscode.Location(target, new vscode.Range(0, 0, 0, 0))
      );
    }
  }

  const componentHits = await findExtensionsProvidingList(
    'component',
    namePascal
  );
  for (const hit of componentHits) {
    const target = await resolveNamedStaticExport(
      hit.extensionRoot,
      namePascal,
      'components'
    );
    if (target && !seen.has(target.fsPath)) {
      seen.add(target.fsPath);
      locations.push(
        new vscode.Location(target, new vscode.Range(0, 0, 0, 0))
      );
    }
  }

  if (locations.length === 0) {
    return undefined;
  }
  return locations;
}
