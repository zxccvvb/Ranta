import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

/** 模板里可能是 kebab-case（scan-combo-detail）或大驼峰（ScanComboDetail） */
export function tagToWidgetPascal(tag: string): string {
  const t = tag.trim();
  if (!t) {
    return t;
  }
  if (t.includes('-')) {
    return t
      .split('-')
      .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase())
      .join('');
  }
  // 已是大驼峰或小写开头：首字母大写，其余保持（兼容 ScanComboDetail / scanComboDetail）
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const BUILTIN_TAGS = new Set(
  [
    'template',
    'script',
    'style',
    'slot',
    'component',
    'transition',
    'keep-alive',
    'router-view',
    'router-link',
    'view',
    'scroll-view',
    'swiper',
    'swiper-item',
    'movable-view',
    'movable-area',
    'cover-view',
    'cover-image',
    'icon',
    'text',
    'rich-text',
    'progress',
    'button',
    'checkbox',
    'form',
    'input',
    'label',
    'picker',
    'picker-view',
    'radio',
    'slider',
    'switch',
    'textarea',
    'navigator',
    'audio',
    'image',
    'video',
    'camera',
    'live-player',
    'live-pusher',
    'map',
    'canvas',
    'web-view',
    'block',
    'open-data',
    'official-account',
    'editor',
    'ad',
    'page-meta',
    'navigation-bar',
    'match-media',
    'root-portal',
    'page-container',
  ].map((s) => s.toLowerCase())
);

export function shouldSkipTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  if (lower.startsWith('van-')) {
    return true;
  }
  return BUILTIN_TAGS.has(lower);
}

/** 从当前文件路径向上查找包含 extension.json 的目录（视为 extension 根目录） */
export async function findExtensionRootAsync(
  startUri: vscode.Uri
): Promise<vscode.Uri | undefined> {
  let dir = path.dirname(startUri.fsPath);
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const minLen = root ? root.length : 0;

  while (dir.length >= minLen) {
    const check = vscode.Uri.file(path.join(dir, 'extension.json'));
    try {
      await vscode.workspace.fs.stat(check);
      return vscode.Uri.file(dir);
    } catch {
      // not found
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

export interface ExtensionJsonWidget {
  default?: string;
  provide?: string[];
  consume?: string[];
}

export interface ParsedExtensionJson {
  widget?: ExtensionJsonWidget;
  component?: ExtensionJsonWidget;
  lambda?: ExtensionJsonWidget;
}

export async function readExtensionJson(
  extensionRoot: vscode.Uri
): Promise<(ParsedExtensionJson & { rawPath: string }) | undefined> {
  const uri = vscode.Uri.joinPath(extensionRoot, 'extension.json');
  try {
    const buf = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(buf).toString('utf8');
    const j = JSON.parse(text) as ParsedExtensionJson;
    return { ...j, rawPath: uri.fsPath };
  } catch {
    return undefined;
  }
}

/** 解析 index.js 中的 import */
export function parseIndexJsImports(source: string): Map<string, string> {
  const imports = new Map<string, string>();
  let m: RegExpExecArray | null;

  const defaultImportRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = defaultImportRe.exec(source)) !== null) {
    imports.set(m[1], m[2]);
  }

  const namedImportRe = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = namedImportRe.exec(source)) !== null) {
    const pathPart = m[2];
    const parts = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      const mm = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(part);
      if (mm) {
        const alias = mm[2] || mm[1];
        imports.set(alias, pathPart);
      }
    }
  }
  return imports;
}

const STATIC_MARKERS = [
  'static widgets',
  'static components',
  'static lambdas',
] as const;

/** 解析 static widgets / components / lambdas 块中的导出键名 */
export function parseStaticBlockKeys(
  source: string,
  marker: (typeof STATIC_MARKERS)[number]
): string[] {
  const keys: string[] = [];
  const staticIdx = source.indexOf(marker);
  if (staticIdx === -1) {
    return keys;
  }
  const eq = source.indexOf('=', staticIdx);
  const open = source.indexOf('{', eq);
  if (open === -1) {
    return keys;
  }
  let depth = 0;
  let i = open;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        break;
      }
    }
  }
  const body = source.slice(open + 1, i);
  const lines = body.split(/[\n,]/);
  for (const line of lines) {
    const trimmed = line.trim().replace(/\/\/.*$/, '').trim();
    if (!trimmed) {
      continue;
    }
    const prop = /^(\w+)\s*:/.exec(trimmed);
    if (prop) {
      keys.push(prop[1]);
      continue;
    }
    const shorthand = /^(\w+)\s*$/.exec(trimmed);
    if (shorthand) {
      keys.push(shorthand[1]);
    }
  }
  return keys;
}

/** 解析 index.js 中 import 与 static widgets */
export function parseIndexJsWidgets(source: string): {
  imports: Map<string, string>;
  widgetKeys: string[];
} {
  const imports = parseIndexJsImports(source);
  const widgetKeys = parseStaticBlockKeys(source, 'static widgets');
  return { imports, widgetKeys };
}

export async function resolveImportToFile(
  extensionRoot: vscode.Uri,
  importPath: string
): Promise<vscode.Uri | undefined> {
  if (importPath.startsWith('@') || importPath.includes('node_modules')) {
    return undefined;
  }
  const base = extensionRoot.fsPath;
  const candidates: string[] = [];
  const noExt = path.resolve(base, importPath);
  candidates.push(noExt + '.vue', noExt + '.js', noExt + '.ts');
  candidates.push(path.join(noExt, 'index.vue'));
  candidates.push(path.join(noExt, 'index.js'));
  if (importPath.endsWith('.vue') || importPath.endsWith('.js')) {
    candidates.unshift(path.resolve(base, importPath));
  }
  for (const p of candidates) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(p));
      return vscode.Uri.file(p);
    } catch {
      // try next
    }
  }
  return undefined;
}

export async function resolveNamedStaticExport(
  extensionRoot: vscode.Uri,
  exportName: string,
  kind: 'widgets' | 'components' | 'lambdas'
): Promise<vscode.Uri | undefined> {
  const indexUri = vscode.Uri.joinPath(extensionRoot, 'index.js');
  let buf: Uint8Array;
  try {
    buf = await vscode.workspace.fs.readFile(indexUri);
  } catch {
    return undefined;
  }
  const source = Buffer.from(buf).toString('utf8');
  const imports = parseIndexJsImports(source);
  const marker =
    kind === 'widgets'
      ? 'static widgets'
      : kind === 'components'
        ? 'static components'
        : 'static lambdas';
  const keys = parseStaticBlockKeys(source, marker);
  if (!keys.includes(exportName)) {
    return undefined;
  }
  const imp = imports.get(exportName);
  if (!imp) {
    return undefined;
  }
  return resolveImportToFile(extensionRoot, imp);
}

export async function resolveWidgetInExtension(
  extensionRoot: vscode.Uri,
  widgetPascal: string
): Promise<vscode.Uri | undefined> {
  return resolveNamedStaticExport(extensionRoot, widgetPascal, 'widgets');
}

export interface GlobalProviderHit {
  extensionRoot: vscode.Uri;
  extensionJsonPath: string;
}

const WALK_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.next',
  'build',
  'coverage',
  'miniprogram_npm',
]);

/**
 * 在磁盘上枚举「extensions 的直接子目录下的 extension.json」。
 * 不依赖 VS Code 的 search index，因此能扫到被 .gitignore 忽略的 Tee 源码目录（如 src/ext-tee-*）。
 */
async function collectExtensionJsonPaths(workspaceRoot: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 48) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (WALK_SKIP_DIRS.has(e.name)) {
          continue;
        }
        await walk(full, depth + 1);
      } else if (e.name === 'extension.json') {
        const grand = path.basename(path.dirname(dir));
        if (grand === 'extensions') {
          results.push(full);
        }
      }
    }
  }
  await walk(workspaceRoot, 0);
  return results;
}

/** data.provide / data.consume 可能是 string[] 或 Record<key, …> */
export function keysFromDataBlock(block: unknown): string[] {
  if (block == null) {
    return [];
  }
  if (Array.isArray(block)) {
    return block.filter((x): x is string => typeof x === 'string');
  }
  if (typeof block === 'object') {
    return Object.keys(block as Record<string, unknown>);
  }
  return [];
}

/** 全局查找在 extension.json 的 data.provide 中声明了某字段的 extension */
export async function findExtensionsProvidingDataKey(
  key: string
): Promise<GlobalProviderHit[]> {
  const hits: GlobalProviderHit[] = [];
  const roots = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
  const jsonPaths: string[] = [];
  for (const root of roots) {
    jsonPaths.push(...(await collectExtensionJsonPaths(root)));
  }
  const seenPath = new Set<string>();
  for (const jsonPath of jsonPaths) {
    if (seenPath.has(jsonPath)) {
      continue;
    }
    seenPath.add(jsonPath);
    try {
      const text = await fs.readFile(jsonPath, 'utf8');
      const j = JSON.parse(text) as { data?: { provide?: unknown } };
      const keys = keysFromDataBlock(j.data?.provide);
      if (keys.includes(key)) {
        const dir = path.dirname(jsonPath);
        hits.push({
          extensionRoot: vscode.Uri.file(dir),
          extensionJsonPath: jsonPath,
        });
      }
    } catch {
      // skip
    }
  }
  return hits;
}

/** 全局查找在 extension.json 的 process.define 中声明了某名称的 extension */
export async function findExtensionsDefiningProcess(
  name: string
): Promise<GlobalProviderHit[]> {
  const hits: GlobalProviderHit[] = [];
  const roots = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
  const jsonPaths: string[] = [];
  for (const root of roots) {
    jsonPaths.push(...(await collectExtensionJsonPaths(root)));
  }
  const seenPath = new Set<string>();
  for (const jsonPath of jsonPaths) {
    if (seenPath.has(jsonPath)) {
      continue;
    }
    seenPath.add(jsonPath);
    try {
      const text = await fs.readFile(jsonPath, 'utf8');
      const j = JSON.parse(text) as { process?: { define?: unknown } };
      const def = j.process?.define;
      const names = Array.isArray(def)
        ? def.filter((x): x is string => typeof x === 'string')
        : [];
      if (names.includes(name)) {
        const dir = path.dirname(jsonPath);
        hits.push({
          extensionRoot: vscode.Uri.file(dir),
          extensionJsonPath: jsonPath,
        });
      }
    } catch {
      // skip
    }
  }
  return hits;
}

/** 全局查找在 extension.json 的 event.listen 中声明了某事件名的 extension（可选 exclude） */
export async function findExtensionsDeclaringEventListen(
  eventName: string,
  excludeExtensionRoot?: vscode.Uri
): Promise<GlobalProviderHit[]> {
  const hits: GlobalProviderHit[] = [];
  const roots = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
  const jsonPaths: string[] = [];
  for (const root of roots) {
    jsonPaths.push(...(await collectExtensionJsonPaths(root)));
  }
  const seenPath = new Set<string>();
  for (const jsonPath of jsonPaths) {
    if (seenPath.has(jsonPath)) {
      continue;
    }
    seenPath.add(jsonPath);
    try {
      const text = await fs.readFile(jsonPath, 'utf8');
      const j = JSON.parse(text) as { event?: { listen?: unknown } };
      const list = j.event?.listen;
      const names = Array.isArray(list)
        ? list.filter((x): x is string => typeof x === 'string')
        : [];
      if (!names.includes(eventName)) {
        continue;
      }
      const dir = path.dirname(jsonPath);
      const extRoot = vscode.Uri.file(dir);
      if (
        excludeExtensionRoot &&
        extRoot.fsPath === excludeExtensionRoot.fsPath
      ) {
        continue;
      }
      hits.push({
        extensionRoot: extRoot,
        extensionJsonPath: jsonPath,
      });
    } catch {
      // skip
    }
  }
  return hits;
}

/** 全局查找在 extension.json 的 event.emit 中声明了某事件名的 extension（可选 exclude） */
export async function findExtensionsDeclaringEventEmit(
  eventName: string,
  excludeExtensionRoot?: vscode.Uri
): Promise<GlobalProviderHit[]> {
  const hits: GlobalProviderHit[] = [];
  const roots = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
  const jsonPaths: string[] = [];
  for (const root of roots) {
    jsonPaths.push(...(await collectExtensionJsonPaths(root)));
  }
  const seenPath = new Set<string>();
  for (const jsonPath of jsonPaths) {
    if (seenPath.has(jsonPath)) {
      continue;
    }
    seenPath.add(jsonPath);
    try {
      const text = await fs.readFile(jsonPath, 'utf8');
      const j = JSON.parse(text) as { event?: { emit?: unknown } };
      const list = j.event?.emit;
      const names = Array.isArray(list)
        ? list.filter((x): x is string => typeof x === 'string')
        : [];
      if (!names.includes(eventName)) {
        continue;
      }
      const dir = path.dirname(jsonPath);
      const extRoot = vscode.Uri.file(dir);
      if (
        excludeExtensionRoot &&
        extRoot.fsPath === excludeExtensionRoot.fsPath
      ) {
        continue;
      }
      hits.push({
        extensionRoot: extRoot,
        extensionJsonPath: jsonPath,
      });
    } catch {
      // skip
    }
  }
  return hits;
}

/** 枚举工作区内所有 Tee extension 根目录（含 extension.json 的目录） */
export async function enumerateExtensionRoots(): Promise<vscode.Uri[]> {
  const roots = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
  const jsonPaths: string[] = [];
  for (const root of roots) {
    jsonPaths.push(...(await collectExtensionJsonPaths(root)));
  }
  const seen = new Set<string>();
  const out: vscode.Uri[] = [];
  for (const p of jsonPaths) {
    const dir = path.dirname(p);
    if (seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    out.push(vscode.Uri.file(dir));
  }
  return out;
}

/** 在工作区根目录下搜索 widget / component / lambda 的 provide 列表是否包含指定名称 */
export async function findExtensionsProvidingList(
  sectionKey: 'widget' | 'component' | 'lambda',
  name: string
): Promise<GlobalProviderHit[]> {
  const hits: GlobalProviderHit[] = [];
  const roots = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
  const jsonPaths: string[] = [];
  for (const root of roots) {
    jsonPaths.push(...(await collectExtensionJsonPaths(root)));
  }
  const seenPath = new Set<string>();
  for (const jsonPath of jsonPaths) {
    if (seenPath.has(jsonPath)) {
      continue;
    }
    seenPath.add(jsonPath);
    try {
      const text = await fs.readFile(jsonPath, 'utf8');
      const j = JSON.parse(text) as ParsedExtensionJson;
      const block =
        sectionKey === 'widget'
          ? j.widget
          : sectionKey === 'component'
            ? j.component
            : j.lambda;
      const provide = block?.provide;
      if (Array.isArray(provide) && provide.includes(name)) {
        const dir = path.dirname(jsonPath);
        hits.push({
          extensionRoot: vscode.Uri.file(dir),
          extensionJsonPath: jsonPath,
        });
      }
    } catch {
      // skip
    }
  }
  return hits;
}

/** @deprecated 使用 findExtensionsProvidingList('widget', name) */
export async function findExtensionsProvidingWidget(
  widgetPascal: string
): Promise<GlobalProviderHit[]> {
  return findExtensionsProvidingList('widget', widgetPascal);
}

/** 光标所在行上，若落在 `<tag` 或 `</tag` 的标签名上则返回该标签名 */
export function getVueTagNameAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): string | undefined {
  const line = document.lineAt(position.line).text;
  const offset = position.character;
  const tagRegex = /<(\/?)([A-Za-z][A-Za-z0-9-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(line)) !== null) {
    const name = m[2];
    const nameStart = m.index + m[0].length - name.length;
    const nameEnd = nameStart + name.length;
    if (offset >= nameStart && offset < nameEnd) {
      return name;
    }
  }
  return undefined;
}
