import * as vscode from 'vscode';
import {
  findExtensionRootAsync,
  findExtensionsProvidingList,
  findPageScopedExtensionsProvidingList,
  readExtensionJson,
  resolvePageBindingWidgetTargets,
  resolveStaticOrConventionExport,
} from './widgetResolver';

/**
 * 解析 Vue 模板标签对应的实现（widget 或 component）：
 * 1. 本 extension 的 widget.provide / component.provide 命中 → 解析 static 或约定文件。
 * 2. 页面 ranta-config 的 bindings.widget.X 命中 → 解析绑定 moduleId + name。
 * 3. 同一 page modules 内搜索 widget.provide / component.provide。
 * 4. 最后在工作区内搜索任意 extension.json 的 widget.provide 与 component.provide。
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
      const target = await resolveStaticOrConventionExport(
        extRoot,
        namePascal,
        'widgets'
      );
      if (target) {
        return [new vscode.Location(target, new vscode.Range(0, 0, 0, 0))];
      }
    }
    if (componentProvides.includes(namePascal)) {
      const target = await resolveStaticOrConventionExport(
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

  if (extRoot) {
    const boundTargets = await resolvePageBindingWidgetTargets(extRoot, namePascal);
    for (const target of boundTargets) {
      if (!seen.has(target.fsPath)) {
        seen.add(target.fsPath);
        locations.push(
          new vscode.Location(target, new vscode.Range(0, 0, 0, 0))
        );
      }
    }
  }

  const pageScopedWidgetHits = extRoot
    ? await findPageScopedExtensionsProvidingList(extRoot, 'widget', namePascal)
    : [];
  const globalWidgetHits = await findExtensionsProvidingList('widget', namePascal);
  const widgetHitSources = pageScopedWidgetHits.length
    ? pageScopedWidgetHits
    : globalWidgetHits;

  for (const hit of widgetHitSources) {
    const target = await resolveStaticOrConventionExport(
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

  // 同页 provider 声明了 widget 但未能解析到文件时，退回全局 provider 搜索
  if (
    locations.length === 0 &&
    pageScopedWidgetHits.length > 0 &&
    globalWidgetHits.length > 0
  ) {
    for (const hit of globalWidgetHits) {
      const target = await resolveStaticOrConventionExport(
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
  }

  const pageScopedComponentHits = extRoot
    ? await findPageScopedExtensionsProvidingList(extRoot, 'component', namePascal)
    : [];
  const globalComponentHits = await findExtensionsProvidingList('component', namePascal);
  const componentHitSources = pageScopedComponentHits.length
    ? pageScopedComponentHits
    : globalComponentHits;

  for (const hit of componentHitSources) {
    const target = await resolveStaticOrConventionExport(
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

  if (
    locations.length === 0 &&
    pageScopedComponentHits.length > 0 &&
    globalComponentHits.length > 0
  ) {
    for (const hit of globalComponentHits) {
      const target = await resolveStaticOrConventionExport(
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
  }

  if (locations.length === 0) {
    return undefined;
  }
  return locations;
}
