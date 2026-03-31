import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  combineExtensionJsonContext,
  getJsonStringAtPosition,
  inferExtensionJsonContext,
} from './extensionJsonContext';
import { escapeRegExp, searchFirstInExtension } from './extensionSearch';
import {
  findExtensionRootAsync,
  findExtensionsProvidingList,
  readExtensionJson,
  resolveNamedStaticExport,
} from './widgetResolver';

const RESERVED_SYMBOLS = new Set([
  'provide',
  'consume',
  'define',
  'invoke',
  'emit',
  'listen',
  'default',
  'widget',
  'component',
  'data',
  'lambda',
  'process',
  'event',
]);

function staticKindFor(
  section: 'widget' | 'component' | 'lambda'
): 'widgets' | 'components' | 'lambdas' {
  if (section === 'widget') {
    return 'widgets';
  }
  if (section === 'component') {
    return 'components';
  }
  return 'lambdas';
}

async function resolveStaticListSymbol(
  section: 'widget' | 'component' | 'lambda',
  extensionRoot: vscode.Uri,
  name: string
): Promise<vscode.Location[] | undefined> {
  const meta = await readExtensionJson(extensionRoot);
  const block =
    section === 'widget'
      ? meta?.widget
      : section === 'component'
        ? meta?.component
        : meta?.lambda;
  const provides = block?.provide ?? [];
  const sk = staticKindFor(section);

  if (provides.includes(name)) {
    const u = await resolveNamedStaticExport(extensionRoot, name, sk);
    if (u) {
      return [new vscode.Location(u, new vscode.Range(0, 0, 0, 0))];
    }
  }

  const hits = await findExtensionsProvidingList(section, name);
  const out: vscode.Location[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const u = await resolveNamedStaticExport(h.extensionRoot, name, sk);
    if (u && !seen.has(u.fsPath)) {
      seen.add(u.fsPath);
      out.push(new vscode.Location(u, new vscode.Range(0, 0, 0, 0)));
    }
  }
  return out.length ? out : undefined;
}

export async function resolveExtensionJsonDefinition(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Location[] | undefined> {
  if (!document.fileName.endsWith('extension.json')) {
    return undefined;
  }
  const base = inferExtensionJsonContext(document, position);
  const str = getJsonStringAtPosition(document, position);
  if (!base || !str) {
    return undefined;
  }
  if (RESERVED_SYMBOLS.has(str.text)) {
    return undefined;
  }
  const ctx = combineExtensionJsonContext(base, str);
  const sym = ctx.symbol;
  const extRoot = vscode.Uri.file(path.dirname(document.uri.fsPath));

  if (ctx.section === 'widget' && ctx.sub === 'default') {
    const u = await resolveNamedStaticExport(extRoot, sym, 'widgets');
    return u
      ? [new vscode.Location(u, new vscode.Range(0, 0, 0, 0))]
      : undefined;
  }

  if (
    (ctx.section === 'widget' ||
      ctx.section === 'component' ||
      ctx.section === 'lambda') &&
    (ctx.sub === 'provide' || ctx.sub === 'consume')
  ) {
    return resolveStaticListSymbol(ctx.section, extRoot, sym);
  }

  if (
    ctx.section === 'data' &&
    (ctx.sub === 'provide' || ctx.sub === 'consume')
  ) {
    const re = new RegExp(
      `(?:this\\.data|this\\.ctx\\.data|ctx\\.data)\\.${escapeRegExp(sym)}\\b`
    );
    const loc = await searchFirstInExtension(extRoot, re);
    return loc ? [loc] : undefined;
  }

  if (ctx.section === 'process' && ctx.sub === 'define') {
    const re = new RegExp(
      `(?:this\\.ctx\\.process|this\\.process|process)\\.define\\s*\\(\\s*['"]${escapeRegExp(sym)}['"]`
    );
    const loc = await searchFirstInExtension(extRoot, re);
    return loc ? [loc] : undefined;
  }

  if (ctx.section === 'process' && ctx.sub === 'invoke') {
    const re = new RegExp(
      `\\.invoke\\s*\\(\\s*['"]${escapeRegExp(sym)}['"]`
    );
    const loc = await searchFirstInExtension(extRoot, re);
    return loc ? [loc] : undefined;
  }

  if (
    ctx.section === 'event' &&
    (ctx.sub === 'emit' || ctx.sub === 'listen')
  ) {
    const re = new RegExp(
      `(?:\\.emit|\\.listen|emit|listen)\\s*\\(\\s*['"]${escapeRegExp(sym)}['"]`
    );
    const loc = await searchFirstInExtension(extRoot, re);
    return loc ? [loc] : undefined;
  }

  return undefined;
}

/** 在 extension.json 的 data.provide / consume 中定位 `"key":` */
export async function findDataKeyInExtensionJson(
  extensionRoot: vscode.Uri,
  key: string
): Promise<vscode.Location[] | undefined> {
  const jsonUri = vscode.Uri.joinPath(extensionRoot, 'extension.json');
  try {
    const buf = await fs.readFile(jsonUri.fsPath, 'utf8');
    const lines = buf.split(/\r?\n/);
    const keyRe = new RegExp(`"${escapeRegExp(key)}"\\s*:`);
    for (let i = 0; i < lines.length; i++) {
      if (!keyRe.test(lines[i])) {
        continue;
      }
      const col = lines[i].indexOf(`"${key}"`);
      if (col < 0) {
        continue;
      }
      const range = new vscode.Range(
        i,
        col + 1,
        i,
        col + 1 + key.length
      );
      return [new vscode.Location(jsonUri, range)];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** 与 `[` 配对的 `]` 下标（含嵌套方括号） */
function findMatchingBracketEnd(text: string, openIdx: number): number | undefined {
  if (text[openIdx] !== '[') {
    return undefined;
  }
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '[') {
      depth++;
    } else if (c === ']') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return undefined;
}

/** 光标 offset 是否落在任意一处 `mapData(this, [ ... ])` 的数组字面量内 */
function findMapDataArrayRangeContainingOffset(
  text: string,
  offset: number
): boolean {
  const mapDataRe = /mapData\s*\(\s*this\s*,\s*\[/g;
  let m: RegExpExecArray | null;
  while ((m = mapDataRe.exec(text)) !== null) {
    const bracketOpen = m.index + m[0].length - 1;
    const bracketClose = findMatchingBracketEnd(text, bracketOpen);
    if (bracketClose === undefined) {
      continue;
    }
    if (offset >= bracketOpen && offset <= bracketClose) {
      return true;
    }
  }
  return false;
}

/** 当前列是否落在行内 JS 字符串字面量内，返回解码后的字符串内容 */
function getJsStringLiteralAtColumn(
  line: string,
  col: number
): string | undefined {
  const re = /(['"])((?:[^'\\]|\\.)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    if (col >= start && col < end) {
      return m[2];
    }
  }
  return undefined;
}

/**
 * `mapData(this, [ 'a', 'b', ... ])` 中光标在某一字段字符串上时，映射到 extension.json 的 data 键。
 */
export async function resolveMapDataToExtensionJson(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Location[] | undefined> {
  const fullText = document.getText();
  const offset = document.offsetAt(position);
  if (!findMapDataArrayRangeContainingOffset(fullText, offset)) {
    return undefined;
  }
  const line = document.lineAt(position.line).text;
  const key = getJsStringLiteralAtColumn(line, position.character);
  if (!key || !/^[a-zA-Z_$][\w$]*$/.test(key)) {
    return undefined;
  }
  const extRoot = await findExtensionRootAsync(document.uri);
  if (!extRoot) {
    return undefined;
  }
  return findDataKeyInExtensionJson(extRoot, key);
}

/** 从 Vue/JS 中 this.ctx.data.xxx / this.data.xxx 跳转到 extension.json 中 data 声明 */
export async function resolveDataAccessToExtensionJson(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Location[] | undefined> {
  const line = document.lineAt(position.line).text;
  const offset = position.character;
  const re =
    /(?:this\.ctx\.data|this\.data|ctx\.data)\.([a-zA-Z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const key = m[1];
    const start = m.index + m[0].length - key.length;
    const end = start + key.length;
    if (offset < start || offset >= end) {
      continue;
    }
    const extRoot = await findExtensionRootAsync(document.uri);
    if (!extRoot) {
      return undefined;
    }
    return findDataKeyInExtensionJson(extRoot, key);
  }
  return undefined;
}
