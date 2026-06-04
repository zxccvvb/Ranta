import * as path from 'path';
import * as vscode from 'vscode';
import { getVueScriptRegions } from './vueSfcMemberResolve/parseSfcRegions';
import {
  parseIndexJsImports,
  resolveImportToFile,
  tagToWidgetPascal,
  widgetPascalToKebab,
} from './widgetResolver';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 从 components 映射或 import 表解析模板标签对应的组件标识符 */
export function findComponentIdentifierForTag(
  script: string,
  tag: string
): string | undefined {
  const tagEsc = escapeRegExp(tag.trim());
  if (!tagEsc) {
    return undefined;
  }

  const quotedKeyRe = new RegExp(`['"]${tagEsc}['"]\\s*:\\s*(\\w+)`, 'i');
  const quoted = quotedKeyRe.exec(script);
  if (quoted) {
    return quoted[1];
  }

  const bareKeyRe = new RegExp(
    `(?:^|[,{\\s])${tagEsc}\\s*:\\s*(\\w+)`,
    'm'
  );
  const bare = bareKeyRe.exec(script);
  if (bare) {
    return bare[1];
  }

  const pascal = tagToWidgetPascal(tag);
  const imports = parseIndexJsImports(script);
  if (imports.has(pascal)) {
    return pascal;
  }

  return undefined;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * 与 extension 根约定目录类似，但以当前 .vue 所在目录为基准（同级 PrepayCardBalance.vue 等）。
 */
export async function resolveConventionBesideVueFile(
  vueFile: vscode.Uri,
  exportName: string
): Promise<vscode.Uri | undefined> {
  const base = path.dirname(vueFile.fsPath);
  const dirNames = [exportName];
  const kebab = widgetPascalToKebab(exportName);
  if (kebab !== exportName.toLowerCase()) {
    dirNames.push(kebab);
  }
  const candidates: string[] = [];
  for (const dirName of dirNames) {
    const p = path.join(base, dirName);
    candidates.push(
      p + '.vue',
      p + '.js',
      p + '.ts',
      path.join(p, 'index.vue'),
      path.join(p, 'index.js'),
      path.join(p, 'index.ts')
    );
  }
  for (const p of candidates) {
    const uri = vscode.Uri.file(p);
    if (await fileExists(uri)) {
      return uri;
    }
  }
  return undefined;
}

/**
 * 模板标签通过本文件 import + components 注册、未写入 extension.json provide 时的兜底跳转。
 */
export async function resolveVueLocalComponentFromTag(
  fromFile: vscode.Uri,
  tag: string
): Promise<vscode.Uri | undefined> {
  if (!fromFile.fsPath.endsWith('.vue')) {
    return undefined;
  }

  let doc: vscode.TextDocument;
  try {
    doc = await vscode.workspace.openTextDocument(fromFile);
  } catch {
    return undefined;
  }

  const regions = getVueScriptRegions(doc);
  if (!regions.length) {
    return undefined;
  }

  const full = doc.getText();
  let script = '';
  for (const r of regions) {
    script += full.slice(r.innerStartOffset, r.innerEndOffset) + '\n';
  }

  const identifier = findComponentIdentifierForTag(script, tag);
  if (identifier) {
    const imports = parseIndexJsImports(script);
    const imp = imports.get(identifier);
    if (imp) {
      const base = vscode.Uri.file(path.dirname(fromFile.fsPath));
      const target = await resolveImportToFile(base, imp);
      if (target) {
        return target;
      }
    }
  }

  return resolveConventionBesideVueFile(
    fromFile,
    tagToWidgetPascal(tag)
  );
}
