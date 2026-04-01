/** 与 openIdx 处的开括号配对的最外层闭括号下标（含嵌套） */
export function findMatchingCloseParen(
  text: string,
  openIdx: number,
  openCh: string,
  closeCh: string
): number | undefined {
  if (text[openIdx] !== openCh) {
    return undefined;
  }
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === openCh) {
      depth++;
    } else if (c === closeCh) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return undefined;
}
