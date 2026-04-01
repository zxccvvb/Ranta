import * as vscode from 'vscode';
import { locateOptionsApiMemberInScript } from './locateMemberInOptionsApi';
import {
  getVueScriptRegions,
  getVueTemplateRegions,
  offsetInRegion,
} from './parseSfcRegions';

const RESERVED_TEMPLATE_IDS = new Set(
  [
    'true',
    'false',
    'null',
    'undefined',
    'in',
    'of',
    'as',
    'if',
    'else',
    'for',
    'switch',
    'case',
    'default',
    'break',
    'continue',
    'try',
    'catch',
    'finally',
    'throw',
    'new',
    'typeof',
    'void',
    'delete',
    'return',
    'const',
    'let',
    'var',
    'import',
    'export',
  ].map((s) => s.toLowerCase())
);

function wordRangeAtLine(
  line: string,
  col: number
): { start: number; end: number; word: string } | undefined {
  if (col < 0 || col > line.length) {
    return undefined;
  }
  const isId = (c: string) => /[a-zA-Z0-9_$]/.test(c);
  if (!isId(line[col] ?? '')) {
    return undefined;
  }
  let s = col;
  let e = col + 1;
  while (s > 0 && isId(line[s - 1])) {
    s--;
  }
  while (e < line.length && isId(line[e])) {
    e++;
  }
  const word = line.slice(s, e);
  if (!/^[a-zA-Z_$][\w$]*$/.test(word)) {
    return undefined;
  }
  return { start: s, end: e, word };
}

/** script 行内：光标落在 `this.xxx` 的 xxx 上时返回 xxx */
function extractThisMemberAtCursor(
  line: string,
  col: number
): string | undefined {
  const re = /\bthis\.([a-zA-Z_$][\w$]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const name = m[1];
    if (name.startsWith('$')) {
      continue;
    }
    const nameStart = m.index + 'this.'.length;
    const nameEnd = nameStart + name.length;
    if (col >= nameStart && col < nameEnd) {
      return name;
    }
  }
  return undefined;
}

function offsetInMustache(fullText: string, offset: number): boolean {
  const start = fullText.lastIndexOf('{{', offset);
  if (start < 0) {
    return false;
  }
  const end = fullText.indexOf('}}', start + 2);
  if (end < 0) {
    return false;
  }
  return offset >= start + 2 && offset < end;
}

/** 光标是否落在 @ / : / v-* 等绑定属性的引号值内（避免 class="foo" 误跳） */
function colInsideBindingAttrValue(line: string, col: number): boolean {
  const qPairs: { open: number; close: number }[] = [];
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c !== '"' && c !== "'") {
      continue;
    }
    const start = i;
    let j = i + 1;
    for (; j < line.length; j++) {
      if (line[j] === c) {
        break;
      }
    }
    if (j < line.length) {
      qPairs.push({ open: start, close: j });
      i = j;
    }
  }
  for (const { open, close } of qPairs) {
    if (col <= open || col >= close) {
      continue;
    }
    const before = line.slice(0, open).trimEnd();
    if (
      /(?:@[\w-]+|:[\w.-]+|v-on:[\w-]+|v-bind:[\w-]+|v-[\w-]+)\s*=\s*$/i.test(
        before
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Vue 单文件：<script> 中 `this.method`；<template> 中可解析的标识符（mustache / 事件或绑定属性值）。
 * 与 Tee extension.json / widget 跳转解耦，专补 Options API 成员跳转。
 */
export function resolveVueOptionsMemberDefinition(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.Location[] | undefined {
  if (document.languageId !== 'vue') {
    return undefined;
  }

  const fullText = document.getText();
  const offset = document.offsetAt(position);
  const scripts = getVueScriptRegions(document);
  const templates = getVueTemplateRegions(document);

  const scriptReg = offsetInRegion(offset, scripts);
  let member: string | undefined;

  if (scriptReg) {
    const line = document.lineAt(position.line).text;
    member = extractThisMemberAtCursor(line, position.character);
  } else if (offsetInRegion(offset, templates)) {
    const line = document.lineAt(position.line).text;
    const wr = wordRangeAtLine(line, position.character);
    if (
      wr &&
      !RESERVED_TEMPLATE_IDS.has(wr.word.toLowerCase()) &&
      wr.word.length >= 2
    ) {
      const inM = offsetInMustache(fullText, offset);
      const inAttr = colInsideBindingAttrValue(line, position.character);
      if (inM || inAttr) {
        member = wr.word;
      }
    }
  }

  if (!member) {
    return undefined;
  }

  for (const reg of scripts) {
    const inner = fullText.slice(reg.innerStartOffset, reg.innerEndOffset);
    const rel = locateOptionsApiMemberInScript(inner, member);
    if (rel === undefined) {
      continue;
    }
    const abs = reg.innerStartOffset + rel;
    const pos = document.positionAt(abs);
    const end = pos.translate(0, member.length);
    return [new vscode.Location(document.uri, new vscode.Range(pos, end))];
  }

  return undefined;
}
