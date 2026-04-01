import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  combineExtensionJsonContext,
  getJsonStringAtPosition,
  inferExtensionJsonContext,
} from './extensionJsonContext';
import { escapeRegExp, searchAllInExtension } from './extensionSearch';
import {
  findExtensionsDeclaringEventEmit,
  findExtensionsDeclaringEventListen,
  findExtensionRootAsync,
  findExtensionsDefiningProcess,
  findExtensionsProvidingDataKey,
  findExtensionsProvidingList,
  enumerateExtensionRoots,
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

function uriPathEqual(a: vscode.Uri, b: vscode.Uri): boolean {
  return a.fsPath === b.fsPath;
}

function dedupeLocations(locs: vscode.Location[]): vscode.Location[] {
  const seen = new Set<string>();
  const out: vscode.Location[] = [];
  for (const l of locs) {
    const k = `${l.uri.fsPath}:${l.range.start.line}:${l.range.start.character}:${l.range.end.line}:${l.range.end.character}`;
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(l);
  }
  return out;
}

/** data：对 xxx 的赋值（含 this.ctx.data / this.data / ctx.data） */
function dataAssignRegex(sym: string): RegExp {
  return new RegExp(
    `(?:this\\.ctx\\.data|this\\.data|ctx\\.data)\\.${escapeRegExp(sym)}\\b\\s*=`
  );
}

function dataBracketAssignRegex(sym: string): RegExp {
  return new RegExp(
    `(?:this\\.ctx\\.data|this\\.data|ctx\\.data)\\[\\s*['"]${escapeRegExp(sym)}['"]\\s*\\]\\s*=`
  );
}

function dataAccessRegex(sym: string): RegExp {
  return new RegExp(
    `(?:this\\.ctx\\.data|this\\.data|ctx\\.data)\\.${escapeRegExp(sym)}\\b`
  );
}

/** event：.emit('symbol' */
function eventEmitCallRegex(sym: string): RegExp {
  return new RegExp(
    `\\.emit\\s*\\(\\s*['"]${escapeRegExp(sym)}['"]`
  );
}

/** event：.listen('symbol'（如 this.ctx.event.listen） */
function eventListenCallRegex(sym: string): RegExp {
  return new RegExp(
    `\\.listen\\s*\\(\\s*['"]${escapeRegExp(sym)}['"]`
  );
}

function processDefineCallRegex(sym: string): RegExp {
  return new RegExp(
    `(?:this\\.ctx\\.process|this\\.process|process)\\.define\\s*\\(\\s*['"]${escapeRegExp(sym)}['"]`
  );
}

/**
 * data.provide：本 extension 内对字段的赋值；若无赋值则退化为任意 .data.xxx 访问。
 */
async function searchDataSymbolInExtension(
  extensionRoot: vscode.Uri,
  sym: string
): Promise<vscode.Location[]> {
  let merged = [
    ...(await searchAllInExtension(extensionRoot, dataAssignRegex(sym))),
    ...(await searchAllInExtension(extensionRoot, dataBracketAssignRegex(sym))),
  ];
  if (merged.length === 0) {
    merged = await searchAllInExtension(extensionRoot, dataAccessRegex(sym));
  }
  return dedupeLocations(merged);
}

/**
 * data.consume：在全局 data.provide 中声明了该字段的 extension 内搜索赋值/访问。
 */
async function searchDataConsumeAcrossProviders(
  sym: string
): Promise<vscode.Location[]> {
  const providers = await findExtensionsProvidingDataKey(sym);
  const out: vscode.Location[] = [];
  for (const p of providers) {
    out.push(...(await searchDataSymbolInExtension(p.extensionRoot, sym)));
  }
  return dedupeLocations(out);
}

/**
 * process.invoke：在「非当前」extension 中找 define('名称'（优先 JSON process.define 命中目录，否则全盘除当前外搜索）。
 */
async function searchProcessDefineExternal(
  currentExt: vscode.Uri,
  sym: string
): Promise<vscode.Location[]> {
  const re = processDefineCallRegex(sym);
  const defs = await findExtensionsDefiningProcess(sym);
  const external = defs.filter((d) => !uriPathEqual(d.extensionRoot, currentExt));
  let rootsToScan = external.map((d) => d.extensionRoot);
  if (rootsToScan.length === 0) {
    rootsToScan = (await enumerateExtensionRoots()).filter(
      (r) => !uriPathEqual(r, currentExt)
    );
  }
  const out: vscode.Location[] = [];
  for (const root of rootsToScan) {
    out.push(...(await searchAllInExtension(root, re)));
  }
  return dedupeLocations(out);
}

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

  if (ctx.section === 'data' && ctx.sub === 'provide') {
    const locs = await searchDataSymbolInExtension(extRoot, sym);
    return locs.length ? locs : undefined;
  }

  if (ctx.section === 'data' && ctx.sub === 'consume') {
    const locs = await searchDataConsumeAcrossProviders(sym);
    return locs.length ? locs : undefined;
  }

  if (ctx.section === 'process' && ctx.sub === 'define') {
    const re = processDefineCallRegex(sym);
    const locs = await searchAllInExtension(extRoot, re);
    return locs.length ? locs : undefined;
  }

  if (ctx.section === 'process' && ctx.sub === 'invoke') {
    const locs = await searchProcessDefineExternal(extRoot, sym);
    return locs.length ? locs : undefined;
  }

  if (ctx.section === 'event' && ctx.sub === 'emit') {
    const re = eventEmitCallRegex(sym);
    const emitLocs = await searchAllInExtension(extRoot, re);
    const listenDecls = await findExtensionsDeclaringEventListen(sym);
    const reListen = eventListenCallRegex(sym);
    const jsonLocs: vscode.Location[] = [];
    const listenCodeLocs: vscode.Location[] = [];
    for (const d of listenDecls) {
      listenCodeLocs.push(
        ...(await searchAllInExtension(d.extensionRoot, reListen))
      );
      const jl = await findEventNameInExtensionJson(
        d.extensionRoot,
        sym,
        'listen'
      );
      if (jl) {
        jsonLocs.push(...jl);
      }
    }
    const merged = dedupeLocations([...emitLocs, ...listenCodeLocs, ...jsonLocs]);
    return merged.length ? merged : undefined;
  }

  if (ctx.section === 'event' && ctx.sub === 'listen') {
    const emitDecls = await findExtensionsDeclaringEventEmit(sym);
    const reEmit = eventEmitCallRegex(sym);
    const jsonLocs: vscode.Location[] = [];
    const emitCodeLocs: vscode.Location[] = [];
    for (const d of emitDecls) {
      emitCodeLocs.push(
        ...(await searchAllInExtension(d.extensionRoot, reEmit))
      );
      const jl = await findEventNameInExtensionJson(
        d.extensionRoot,
        sym,
        'emit'
      );
      if (jl) {
        jsonLocs.push(...jl);
      }
    }
    const merged = dedupeLocations([...emitCodeLocs, ...jsonLocs]);
    return merged.length ? merged : undefined;
  }

  return undefined;
}

/** 在 extension.json 的 event.emit / listen 数组中定位事件名字符串 */
export async function findEventNameInExtensionJson(
  extensionRoot: vscode.Uri,
  name: string,
  sub: 'emit' | 'listen'
): Promise<vscode.Location[] | undefined> {
  const jsonUri = vscode.Uri.joinPath(extensionRoot, 'extension.json');
  try {
    const buf = await fs.readFile(jsonUri.fsPath, 'utf8');
    const j = JSON.parse(buf) as { event?: { emit?: string[]; listen?: string[] } };
    const arr = sub === 'emit' ? j.event?.emit : j.event?.listen;
    if (!Array.isArray(arr) || !arr.includes(name)) {
      return undefined;
    }
    const lines = buf.split(/\r?\n/);
    const keyRe = new RegExp(`"${escapeRegExp(name)}"`);
    const out: vscode.Location[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!keyRe.test(lines[i])) {
        continue;
      }
      const col = lines[i].indexOf(`"${name}"`);
      if (col < 0) {
        continue;
      }
      const range = new vscode.Range(
        i,
        col + 1,
        i,
        col + 1 + name.length
      );
      out.push(new vscode.Location(jsonUri, range));
    }
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** 在 extension.json 的 process.define / invoke 数组中定位进程名字符串 */
export async function findProcessNameInExtensionJson(
  extensionRoot: vscode.Uri,
  name: string,
  sub: 'define' | 'invoke'
): Promise<vscode.Location[] | undefined> {
  const jsonUri = vscode.Uri.joinPath(extensionRoot, 'extension.json');
  try {
    const buf = await fs.readFile(jsonUri.fsPath, 'utf8');
    const j = JSON.parse(buf) as {
      process?: { define?: string[]; invoke?: string[] };
    };
    const arr = sub === 'define' ? j.process?.define : j.process?.invoke;
    if (!Array.isArray(arr) || !arr.includes(name)) {
      return undefined;
    }
    const lines = buf.split(/\r?\n/);
    const keyRe = new RegExp(`"${escapeRegExp(name)}"`);
    const out: vscode.Location[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!keyRe.test(lines[i])) {
        continue;
      }
      const col = lines[i].indexOf(`"${name}"`);
      if (col < 0) {
        continue;
      }
      const range = new vscode.Range(
        i,
        col + 1,
        i,
        col + 1 + name.length
      );
      out.push(new vscode.Location(jsonUri, range));
    }
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
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

function extractQuotedFirstArgAfterMethod(
  line: string,
  col: number,
  method: 'listen' | 'emit'
): string | undefined {
  const re = new RegExp(
    `\\.${method}\\s*\\(\\s*(['"])((?:[^'\\\\]|\\\\.)*)\\1`,
    'g'
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const full = m[0];
    const inner = m[2];
    const base = m.index;
    const quoteInFull = full.indexOf(m[1] + inner);
    const valueStart = base + quoteInFull + 1;
    const valueEnd = valueStart + inner.length;
    if (col >= valueStart && col < valueEnd) {
      return inner;
    }
  }
  return undefined;
}

function extractQuotedFirstArgProcessDefine(
  line: string,
  col: number
): string | undefined {
  const re =
    /(?:this\.ctx\.process|this\.process|ctx\.process|process)\.define\s*\(\s*(['"])((?:[^'\\]|\\.)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const full = m[0];
    const inner = m[2];
    const base = m.index;
    const quoteInFull = full.indexOf(m[1] + inner);
    const valueStart = base + quoteInFull + 1;
    const valueEnd = valueStart + inner.length;
    if (col >= valueStart && col < valueEnd) {
      return inner;
    }
  }
  return undefined;
}

function extractQuotedFirstArgProcessInvoke(
  line: string,
  col: number
): string | undefined {
  const re =
    /(?:this\.ctx\.process|this\.process|ctx\.process|process)\.invoke(?:Pipe)?\s*\(\s*(['"])((?:[^'\\]|\\.)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const full = m[0];
    const inner = m[2];
    const base = m.index;
    const quoteInFull = full.indexOf(m[1] + inner);
    const valueStart = base + quoteInFull + 1;
    const valueEnd = valueStart + inner.length;
    if (col >= valueStart && col < valueEnd) {
      return inner;
    }
  }
  return undefined;
}

function extractLambdaMemberName(line: string, col: number): string | undefined {
  const re = /(?:this\.)?ctx\.lambdas\.([a-zA-Z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const word = m[1];
    const start = m.index + m[0].length - word.length;
    const end = start + word.length;
    if (col >= start && col < end) {
      return word;
    }
  }
  return undefined;
}

/**
 * 从 extension 内 `.vue` / `.js` / `.ts` 源码跳转到声明：
 * - `event.listen` / `event.emit` 首参字符串 → 本 extension `extension.json` 的 `event.listen` / `event.emit` 项；
 * - `process.define` 首参 → `process.define` 列表项；
 * - `process.invoke` / `invokePipe` 首参 → 与 `extension.json` 的 `process.invoke` 一致，在其它 extension 搜 `process.define`；
 * - `ctx.lambdas.xxx` 方法名 → 与 `extension.json` 的 `lambda.provide` 一致（static lambdas）。
 */
export async function resolveTeeRuntimeCodeToDefinition(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Location[] | undefined> {
  const line = document.lineAt(position.line).text;
  const col = position.character;

  const extRoot = await findExtensionRootAsync(document.uri);
  if (!extRoot) {
    return undefined;
  }

  const listenSym = extractQuotedFirstArgAfterMethod(line, col, 'listen');
  if (listenSym) {
    const jl = await findEventNameInExtensionJson(
      extRoot,
      listenSym,
      'listen'
    );
    return jl?.length ? jl : undefined;
  }

  const emitSym = extractQuotedFirstArgAfterMethod(line, col, 'emit');
  if (emitSym) {
    const jl = await findEventNameInExtensionJson(extRoot, emitSym, 'emit');
    return jl?.length ? jl : undefined;
  }

  const defineSym = extractQuotedFirstArgProcessDefine(line, col);
  if (defineSym) {
    const jl = await findProcessNameInExtensionJson(
      extRoot,
      defineSym,
      'define'
    );
    return jl?.length ? jl : undefined;
  }

  const invokeSym = extractQuotedFirstArgProcessInvoke(line, col);
  if (invokeSym) {
    const locs = await searchProcessDefineExternal(extRoot, invokeSym);
    return locs.length ? locs : undefined;
  }

  const lambdaName = extractLambdaMemberName(line, col);
  if (lambdaName) {
    return resolveStaticListSymbol('lambda', extRoot, lambdaName);
  }

  return undefined;
}
