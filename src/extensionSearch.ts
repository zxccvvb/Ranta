import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'miniprogram_npm',
]);

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 枚举 extension 目录下源码文件（浅层递归，避免扫全仓） */
export async function listExtensionSourceFiles(
  extensionRoot: vscode.Uri,
  maxFiles = 400
): Promise<string[]> {
  const root = extensionRoot.fsPath;
  const out: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 12 || out.length >= maxFiles) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) {
        continue;
      }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full, depth + 1);
      } else if (/\.(vue|js|ts|jsx|tsx|mjs|cjs)$/.test(e.name)) {
        out.push(full);
      }
    }
  }
  await walk(root, 0);
  return out;
}

/** 在文件中查找首个匹配行，返回 Location */
export async function findFirstMatchLocation(
  filePath: string,
  regex: RegExp
): Promise<vscode.Location | undefined> {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(regex);
      if (m && m.index !== undefined) {
        const col = m.index;
        const range = new vscode.Range(
          i,
          col,
          i,
          col + m[0].length
        );
        return new vscode.Location(vscode.Uri.file(filePath), range);
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** 在 extension 内多文件搜索第一个匹配 */
export async function searchFirstInExtension(
  extensionRoot: vscode.Uri,
  regex: RegExp
): Promise<vscode.Location | undefined> {
  const files = await listExtensionSourceFiles(extensionRoot);
  for (const f of files) {
    const loc = await findFirstMatchLocation(f, regex);
    if (loc) {
      return loc;
    }
  }
  return undefined;
}

/** 单行内所有匹配（用于同一行多次 emit 等） */
export function findAllMatchLocationsOnLine(
  fileUri: vscode.Uri,
  lineIndex: number,
  line: string,
  regex: RegExp
): vscode.Location[] {
  const locs: vscode.Location[] = [];
  const re = new RegExp(regex.source, regex.flags.replace(/g/g, '') + 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index !== undefined) {
      const col = m.index;
      locs.push(
        new vscode.Location(
          fileUri,
          new vscode.Range(
            lineIndex,
            col,
            lineIndex,
            col + m[0].length
          )
        )
      );
    }
  }
  return locs;
}

/** 在单文件内查找所有匹配 */
export async function findAllMatchLocationsInFile(
  filePath: string,
  regex: RegExp
): Promise<vscode.Location[]> {
  const uri = vscode.Uri.file(filePath);
  const locs: vscode.Location[] = [];
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      locs.push(...findAllMatchLocationsOnLine(uri, i, lines[i], regex));
    }
  } catch {
    return [];
  }
  return locs;
}

/** 在 extension 目录内多文件搜索全部匹配（按文件路径排序） */
export async function searchAllInExtension(
  extensionRoot: vscode.Uri,
  regex: RegExp
): Promise<vscode.Location[]> {
  const files = (await listExtensionSourceFiles(extensionRoot)).sort();
  const out: vscode.Location[] = [];
  for (const f of files) {
    out.push(...(await findAllMatchLocationsInFile(f, regex)));
  }
  return out;
}
