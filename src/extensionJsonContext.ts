import * as vscode from 'vscode';

export type ExtensionJsonSection =
  | 'widget'
  | 'component'
  | 'data'
  | 'lambda'
  | 'process'
  | 'event';

export type ExtensionJsonSubKey =
  | 'provide'
  | 'consume'
  | 'define'
  | 'invoke'
  | 'emit'
  | 'listen'
  /** widget.default → 入口 Main 等 */
  | 'default';

export interface ExtensionJsonCursorContext {
  section: ExtensionJsonSection;
  sub: ExtensionJsonSubKey;
  /** 光标所在 JSON 字符串或键名（不含引号） */
  symbol: string;
  range: vscode.Range;
}

/** 从行内提取光标所在的 JSON 字符串内容（双引号内） */
export function getJsonStringAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): { text: string; range: vscode.Range } | undefined {
  const line = document.lineAt(position.line).text;
  const ch = position.character;
  const strRe = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(line)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    if (ch >= start && ch < end) {
      const valueStart = m.index + 1;
      const valueEnd = m.index + m[0].length - 1;
      const valueRange = new vscode.Range(
        position.line,
        valueStart,
        position.line,
        valueEnd
      );
      return { text: m[1], range: valueRange };
    }
  }
  return undefined;
}

/**
 * 推断 extension.json 中光标所在位置属于哪个 section / sub（扫描到当前行为止）。
 * 约定：顶层 key 为 2 空格缩进；子 key 为 4 空格。
 */
export function inferExtensionJsonContext(
  document: vscode.TextDocument,
  position: vscode.Position
): Omit<ExtensionJsonCursorContext, 'symbol' | 'range'> | undefined {
  const lineIdx = position.line;
  let section: ExtensionJsonSection | null = null;
  let sub: ExtensionJsonSubKey | null = null;

  for (let i = 0; i <= lineIdx; i++) {
    const line = document.lineAt(i).text;
    const top = /^\s{2}"(widget|component|data|lambda|process|event)"\s*:/.exec(
      line
    );
    if (top) {
      section = top[1] as ExtensionJsonSection;
      sub = null;
      continue;
    }
    const subM =
      /^\s{4}"(provide|consume|define|invoke|emit|listen)"\s*:/.exec(line);
    if (subM && section) {
      sub = subM[1] as ExtensionJsonSubKey;
    }
    const defaultM = /^\s{4}"default"\s*:/.exec(line);
    if (defaultM && section === 'widget') {
      sub = 'default';
    }
  }

  if (!section || !sub) {
    return undefined;
  }
  return { section, sub };
}

export function combineExtensionJsonContext(
  base: Omit<ExtensionJsonCursorContext, 'symbol' | 'range'>,
  stringAt: { text: string; range: vscode.Range }
): ExtensionJsonCursorContext {
  return {
    ...base,
    symbol: stringAt.text,
    range: stringAt.range,
  };
}
