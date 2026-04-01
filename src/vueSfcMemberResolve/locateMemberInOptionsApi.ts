import { findMatchingCloseParen } from './braceUtils';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 合并区间（用于排除嵌套块，仅简单合并重叠） */
function mergeIntervals(ints: [number, number][]): [number, number][] {
  if (ints.length === 0) {
    return [];
  }
  const sorted = [...ints].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      out.push(cur);
    }
  }
  return out;
}

function inAnyInterval(idx: number, intervals: [number, number][]): boolean {
  for (const [a, b] of intervals) {
    if (idx >= a && idx < b) {
      return true;
    }
  }
  return false;
}

/**
 * 在对象字面量片段中查找 options 成员定义首字符下标（相对 block 起点的偏移）。
 * methodStyle: methods / computed / watch 中的 `name(` 或 `name:`。
 */
function findInObjectBlock(
  block: string,
  blockBaseOffset: number,
  name: string,
  mode: 'methodObject' | 'dataObject' | 'watchMixed'
): number | undefined {
  const en = escapeRegExp(name);
  const candidates: RegExp[] = [];

  if (mode === 'dataObject') {
    candidates.push(
      new RegExp(`(?:^|[\\n;,{])\\s*${en}\\s*:`, 'gm'),
      new RegExp(`(?:^|[\\n;,{])\\s*['"]${en}['"]\\s*:`, 'gm')
    );
  } else if (mode === 'watchMixed') {
    candidates.push(
      new RegExp(`(?:^|[\\n;,{])\\s*${en}\\s*[:(]`, 'gm'),
      new RegExp(`(?:^|[\\n;,{])\\s*['"]${en}['"]\\s*[:(]`, 'gm')
    );
  } else {
    candidates.push(
      new RegExp(`(?:^|[\\n;,{])\\s*${en}\\s*\\(`, 'gm'),
      new RegExp(`(?:^|[\\n;,{])\\s*${en}\\s*:\\s*function\\b`, 'gm'),
      new RegExp(`(?:^|[\\n;,{])\\s*${en}\\s*:\\s*\\(`, 'gm'),
      new RegExp(`(?:^|[\\n;,{])\\s*['"]${en}['"]\\s*:\\s*\\(`, 'gm'),
      new RegExp(`(?:^|[\\n;,{])\\s*['"]${en}['"]\\s*:\\s*function\\b`, 'gm'),
      new RegExp(`(?:^|[\\n;,{])\\s*['"]${en}['"]\\s*:\\s*\\{`, 'gm')
    );
  }

  let best: number | undefined;
  for (const re of candidates) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
      const rel = m.index + m[0].indexOf(name);
      if (rel >= 0 && (best === undefined || rel < best)) {
        best = rel;
      }
    }
  }
  return best === undefined ? undefined : blockBaseOffset + best;
}

function findExportDefaultObjectRange(
  script: string
): { innerStart: number; innerEnd: number } | undefined {
  const re = /export\s+default\s*\{/g;
  const m = re.exec(script);
  if (!m) {
    return undefined;
  }
  const open = m.index + m[0].length - 1;
  const close = findMatchingCloseParen(script, open, '{', '}');
  if (close === undefined) {
    return undefined;
  }
  return { innerStart: open + 1, innerEnd: close };
}

/** `sectionName:\s*\{` 在 rootSlice 内首次出现，返回 `{` 下标 */
function findSectionBraceOpen(
  rootSlice: string,
  rootBase: number,
  sectionName: string
): number | undefined {
  const re = new RegExp(`\\b${sectionName}\\s*:\\s*\\{`);
  const m = re.exec(rootSlice);
  if (!m || m.index === undefined) {
    return undefined;
  }
  const braceIdx = rootBase + m.index + m[0].length - 1;
  return braceIdx;
}

/**
 * 在单行 script 内（不含 <script> 标签）定位 Options API 成员定义，
 * 返回相对于 script 内文字起始的全局偏移；未找到返回 undefined。
 */
export function locateOptionsApiMemberInScript(
  scriptInner: string,
  memberName: string
): number | undefined {
  if (!/^[a-zA-Z_$][\w$]*$/.test(memberName)) {
    return undefined;
  }

  const root = findExportDefaultObjectRange(scriptInner);
  if (!root) {
    return undefined;
  }

  const rootSlice = scriptInner.slice(root.innerStart, root.innerEnd);
  const excluded: [number, number][] = [];

  const trySection = (
    section: string,
    mode: 'methodObject' | 'dataObject' | 'watchMixed'
  ): number | undefined => {
    const openInRoot = findSectionBraceOpen(
      rootSlice,
      root.innerStart,
      section
    );
    if (openInRoot === undefined) {
      return undefined;
    }
    const close = findMatchingCloseParen(scriptInner, openInRoot, '{', '}');
    if (close === undefined) {
      return undefined;
    }
    excluded.push([openInRoot, close + 1]);
    const bodyStart = openInRoot + 1;
    const body = scriptInner.slice(bodyStart, close);
    return findInObjectBlock(body, bodyStart, memberName, mode);
  };

  const fromMethods = trySection('methods', 'methodObject');
  if (fromMethods !== undefined) {
    return fromMethods;
  }
  const fromComputed = trySection('computed', 'methodObject');
  if (fromComputed !== undefined) {
    return fromComputed;
  }
  const fromWatch = trySection('watch', 'watchMixed');
  if (fromWatch !== undefined) {
    return fromWatch;
  }

  // data() { return { ... } }
  const dataFnRe = /\bdata\s*\(\s*\)\s*\{/g;
  let dm: RegExpExecArray | null;
  while ((dm = dataFnRe.exec(rootSlice)) !== null) {
    const fnOpen = root.innerStart + dm.index + dm[0].length - 1;
    const fnClose = findMatchingCloseParen(scriptInner, fnOpen, '{', '}');
    if (fnClose === undefined) {
      continue;
    }
    excluded.push([fnOpen, fnClose + 1]);
    const dataFnBody = scriptInner.slice(fnOpen + 1, fnClose);
    const retM = /\breturn\s*\{/.exec(dataFnBody);
    if (!retM) {
      continue;
    }
    const retOpen = fnOpen + 1 + retM.index + retM[0].length - 1;
    const retClose = findMatchingCloseParen(scriptInner, retOpen, '{', '}');
    if (retClose === undefined) {
      continue;
    }
    const retBody = scriptInner.slice(retOpen + 1, retClose);
    const hit = findInObjectBlock(
      retBody,
      retOpen + 1,
      memberName,
      'dataObject'
    );
    if (hit !== undefined) {
      return hit;
    }
  }

  // 根级生命周期 / logicData 等：foo() { —— 排除 methods/computed/watch/data 已占区间
  const merged = mergeIntervals(excluded);
  const rootLifecycleRe = new RegExp(
    `(?:^|\\n)(\\s*)${escapeRegExp(memberName)}\\s*\\(\\s*\\)\\s*\\{`,
    'gm'
  );
  let lm: RegExpExecArray | null;
  while ((lm = rootLifecycleRe.exec(rootSlice)) !== null) {
    const abs = root.innerStart + lm.index;
    if (inAnyInterval(abs, merged)) {
      continue;
    }
    const nameStartInMatch = lm[0].indexOf(memberName);
    if (nameStartInMatch < 0) {
      continue;
    }
    return abs + nameStartInMatch;
  }

  return undefined;
}
