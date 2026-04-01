import * as vscode from 'vscode';

export interface SfcRegion {
  innerStartOffset: number;
  innerEndOffset: number;
}

const SCRIPT_OPEN_RE = /<script\b[^>]*>/gi;
const SCRIPT_CLOSE_RE = /<\/script>/gi;
const TEMPLATE_OPEN_RE = /<template\b[^>]*>/gi;
const TEMPLATE_CLOSE_RE = /<\/template>/gi;

function collectBlock(
  fullText: string,
  openRe: RegExp,
  closeRe: RegExp
): SfcRegion[] {
  const out: SfcRegion[] = [];
  openRe.lastIndex = 0;
  let om: RegExpExecArray | null;
  while ((om = openRe.exec(fullText)) !== null) {
    const innerStart = om.index + om[0].length;
    closeRe.lastIndex = innerStart;
    const cm = closeRe.exec(fullText);
    if (!cm) {
      break;
    }
    const innerEnd = cm.index;
    if (innerEnd > innerStart) {
      out.push({ innerStartOffset: innerStart, innerEndOffset: innerEnd });
    }
    openRe.lastIndex = cm.index + cm[0].length;
  }
  return out;
}

export function getVueScriptRegions(document: vscode.TextDocument): SfcRegion[] {
  const fullText = document.getText();
  return collectBlock(fullText, SCRIPT_OPEN_RE, SCRIPT_CLOSE_RE);
}

export function getVueTemplateRegions(
  document: vscode.TextDocument
): SfcRegion[] {
  const fullText = document.getText();
  return collectBlock(fullText, TEMPLATE_OPEN_RE, TEMPLATE_CLOSE_RE);
}

export function offsetInRegion(
  offset: number,
  regions: SfcRegion[]
): SfcRegion | undefined {
  for (const r of regions) {
    if (offset >= r.innerStartOffset && offset < r.innerEndOffset) {
      return r;
    }
  }
  return undefined;
}
