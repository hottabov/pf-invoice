/**
 * Spreadsheet address arithmetic. Needed because a cell we want to write may
 * be absent from the sheet XML entirely -- Excel omits empty cells -- so the
 * patcher has to insert a new `<c>` at the right place in column order.
 */

const REF_PATTERN = /^([A-Z]+)(\d+)$/;

/** "A" -> 1, "Z" -> 26, "AA" -> 27. */
export function columnIndex(col: string): number {
  let index = 0;
  for (const char of col) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index;
}

export function splitRef(ref: string): { col: string; colIndex: number; row: number } {
  const match = REF_PATTERN.exec(ref);
  if (!match) throw new Error(`Malformed cell reference: ${ref}`);
  return { col: match[1], colIndex: columnIndex(match[1]), row: Number(match[2]) };
}
