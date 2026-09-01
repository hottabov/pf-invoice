import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { splitRef } from "./cell-ref";

/**
 * Writes values into an .xlsx without disturbing anything else in it.
 *
 * An .xlsx is a zip. We unpack it, rewrite exactly one entry -- the worksheet
 * XML -- and repack. Styles, drawings, embedded images, print settings and
 * the print area are carried across untouched, so the printed form is the
 * form production already knows rather than a reconstruction of it. See
 * `patchWorkbook`'s test for the assertion that keeps this honest.
 *
 * Values are written as inline strings rather than shared strings. A shared
 * string would mean appending to sharedStrings.xml and renumbering, risking a
 * shift in every other string in the workbook; an inline string is local to
 * its own cell and cannot affect anything else.
 */

export type CellPatch = { cell: string; value: string };

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cellXml(ref: string, style: string | null, value: string): string {
  const s = style === null ? "" : ` s="${style}"`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

/** The `<row>` element for `row`, as a slice of `xml`, or null when absent. */
function findRow(xml: string, row: number): { start: number; end: number } | null {
  const open = new RegExp(`<row[^>]*\\br="${row}"[^>]*?(/>|>)`);
  const match = open.exec(xml);
  if (!match) return null;

  if (match[1] === "/>") {
    return { start: match.index, end: match.index + match[0].length };
  }

  const close = xml.indexOf("</row>", match.index);
  if (close === -1) throw new Error(`Unterminated <row r="${row}">`);
  return { start: match.index, end: close + "</row>".length };
}

/** Turns `<row r="8" ht="12"/>` into `<row r="8" ht="12"></row>`. */
function expandSelfClosingRow(rowXml: string): string {
  if (!rowXml.endsWith("/>")) return rowXml;
  return `${rowXml.slice(0, -2)}></row>`;
}

function patchCellInRow(rowXml: string, ref: string, value: string): string {
  const existing = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const match = existing.exec(rowXml);

  if (match) {
    const style = /\bs="(\d+)"/.exec(match[1]);
    return rowXml.replace(existing, cellXml(ref, style ? style[1] : null, value));
  }

  const expanded = expandSelfClosingRow(rowXml);
  const target = splitRef(ref).colIndex;

  // Insert before the first cell that sorts after ours; otherwise append.
  for (const cell of expanded.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
    if (splitRef(cell[1]).colIndex > target) {
      const at = cell.index;
      return expanded.slice(0, at) + cellXml(ref, null, value) + expanded.slice(at);
    }
  }

  const closeAt = expanded.lastIndexOf("</row>");
  return expanded.slice(0, closeAt) + cellXml(ref, null, value) + expanded.slice(closeAt);
}

/** Inserts a new `<row>` into `<sheetData>` in row order. */
function insertRow(xml: string, row: number, inner: string): string {
  const newRow = `<row r="${row}">${inner}</row>`;

  for (const existing of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*?(?:\/>|>)/g)) {
    if (Number(existing[1]) > row) {
      return xml.slice(0, existing.index) + newRow + xml.slice(existing.index);
    }
  }

  const closeAt = xml.indexOf("</sheetData>");
  if (closeAt === -1) throw new Error("No </sheetData> in worksheet XML");
  return xml.slice(0, closeAt) + newRow + xml.slice(closeAt);
}

export function patchSheetXml(xml: string, patches: CellPatch[]): string {
  // Group by row so each row is located and rewritten once, and so offsets
  // from an earlier insert cannot invalidate a later one.
  const byRow = new Map<number, CellPatch[]>();
  for (const patch of patches) {
    const { row } = splitRef(patch.cell);
    byRow.set(row, [...(byRow.get(row) ?? []), patch]);
  }

  let out = xml;

  for (const [row, rowPatches] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const found = findRow(out, row);

    if (!found) {
      let inner = "";
      for (const patch of rowPatches.sort(
        (a, b) => splitRef(a.cell).colIndex - splitRef(b.cell).colIndex,
      )) {
        inner += cellXml(patch.cell, null, patch.value);
      }
      out = insertRow(out, row, inner);
      continue;
    }

    let rowXml = out.slice(found.start, found.end);
    for (const patch of rowPatches) {
      rowXml = patchCellInRow(rowXml, patch.cell, patch.value);
    }
    out = out.slice(0, found.start) + rowXml + out.slice(found.end);
  }

  return out;
}

export function patchWorkbook(
  template: Uint8Array,
  sheetPath: string,
  patches: CellPatch[],
): Uint8Array {
  const files = unzipSync(template);

  const sheet = files[sheetPath];
  if (!sheet) throw new Error(`Template has no ${sheetPath}`);

  files[sheetPath] = strToU8(patchSheetXml(strFromU8(sheet), patches));

  return zipSync(files);
}
