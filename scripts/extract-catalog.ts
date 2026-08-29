/**
 * Extracts the PathQuote product/option catalog from the raw Excel price
 * list into a committed JSON snapshot: prisma/seed-data/catalog.json.
 *
 * Source:  RAW/11 Price List Australia 2026-05-28.xlsx  (9 sheets total).
 * The "Order" sheet is a pure cross-sheet aggregation (SUM/lookup formulas
 * only, no priced items of its own) and is intentionally ignored.
 *
 * Run:     npm run extract:catalog
 *
 * Background reading: docs/reference/price-list-analysis.md. That report is
 * a useful map of the file but its counts are explicitly approximate ("~").
 * This script reads every relevant cell directly (including cached formula
 * results) and is the source of truth; every non-obvious decision below is
 * commented at the point it's made, and the run-time summary reports actual
 * counts so drift from the report is visible rather than silently swallowed.
 *
 * Classification rules (series / product vs. option), duplicate handling,
 * and known data gaps are all implemented per the Task 7 spec; see comments
 * inline for the reasoning behind each judgment call.
 */
import * as XLSX from "xlsx";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SOURCE_XLSX = path.join(ROOT, "RAW", "11 Price List Australia 2026-05-28.xlsx");
const OUTPUT_JSON = path.join(ROOT, "prisma", "seed-data", "catalog.json");

type CatalogItem = {
  code: string;
  name: string;
  description: string;
  price: number | null;
  needsReview: boolean;
};

type CatalogSeries = {
  seriesCode: string;
  seriesName: string;
  maxDiscountPct: number | null;
  products: CatalogItem[];
};

/** A global, deduplicated option -- 1:1 with the DB's Option model. Series
 *  affinity (formerly implicit in "which sheet's options[] it lived in") is
 *  now explicit via compatibleSeries, matching OptionCompatibility. */
type GlobalOption = {
  code: string;
  name: string;
  description: string;
  price: number | null;
  needsReview: boolean;
  compatibleSeries: string[];
};

/** A per-sheet option before cross-sheet merging, tagged with the series it
 *  came from so the merge step can compare prices and build compatibleSeries. */
type SeriesOptions = { seriesCode: string; options: CatalogItem[] };

type LogEntry = { series: string; list: "product" | "option"; code: string; reason: string };
type DisambigEntry = { series: string; list: "product" | "option"; original: string; final: string };
type MergeEntry = { code: string; seriesCodes: string[]; price: number | null };
type SplitEntry = { code: string; variants: { seriesCode: string; finalCode: string; price: number | null }[] };

const dropped: LogEntry[] = [];
const disambiguated: DisambigEntry[] = [];
const merged: MergeEntry[] = [];
const split: SplitEntry[] = [];

// ---------------------------------------------------------------------------
// Generic cell helpers
// ---------------------------------------------------------------------------

/** Collapse internal whitespace runs to a single space and trim the ends. */
function normalize(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

/** Looks up a sheet by name and fails loudly (rather than deferencing
 *  `undefined` deep inside cellText/cellNumber) if the workbook doesn't have
 *  it -- e.g. the source file was resaved with a renamed/reordered tab. */
function getSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error("sheet not found: " + name);
  return ws;
}

function cellText(ws: XLSX.WorkSheet, ref: string): string {
  const c = ws[ref] as XLSX.CellObject | undefined;
  if (!c || c.v === undefined || c.v === null) return "";
  return normalize(c.v);
}

/** Only returns a value for genuinely numeric cells (formula cells included,
 *  via their cached `.v` -- the xlsx package reads the cached result rather
 *  than recomputing). Returns null for blank/text cells, never `undefined`,
 *  so `price === null` is a reliable "missing" check even for price 0. */
function cellNumber(ws: XLSX.WorkSheet, ref: string): number | null {
  const c = ws[ref] as XLSX.CellObject | undefined;
  if (!c || typeof c.v !== "number") return null;
  return c.v;
}

/**
 * Internal engineering notes hand-verified as embedded in otherwise-real,
 * priced item descriptions. Per spec: "if a note is attached to a real
 * priced item, keep the item, drop the note from name." The item itself
 * (code + price) is untouched -- only these trailing note clauses are
 * stripped from the description/name text.
 */
const NOTE_STRIP_PATTERNS: RegExp[] = [
  // M-series C24 "Waste Bin-180": internal question about which widths to support.
  /\.?\s*Do we eliminate this or also include 220\/300\/390\?\s*$/i,
  // EasyLoader D13 "Syncronisation Feature": internal note to production/R&D.
  /\s*jph to discuss with production&RD if we standardize all with sync\?\?\?\s*$/i,
];

function stripNotes(text: string): string {
  let out = text;
  for (const re of NOTE_STRIP_PATTERNS) out = out.replace(re, "");
  return normalize(out);
}

/**
 * Adds an item to a series' product/option list, deduplicating by code
 * (schema requires unique codes; the source file has a few genuine repeats).
 *  - Free code            -> add as-is.
 *  - Collides, disambiguator given (and distinct from the code) -> retry as
 *    `${code} ${disambiguator}` (e.g. two "Drills included" rows disambiguated
 *    by their distinct part-number description).
 *  - Still collides (or no useful disambiguator) -> drop, keep the first
 *    occurrence, and log it (e.g. L-Series' two identical "3.0mm dia punch"
 *    rows -- a genuine duplicate in the source data).
 */
function register(
  list: CatalogItem[],
  seenCodes: Set<string>,
  item: CatalogItem,
  seriesCode: string,
  listType: "product" | "option",
  disambiguator?: string
): void {
  if (!seenCodes.has(item.code)) {
    seenCodes.add(item.code);
    list.push(item);
    return;
  }
  if (disambiguator) {
    const altCode = normalize(`${item.code} ${disambiguator}`);
    if (altCode !== item.code && !seenCodes.has(altCode)) {
      seenCodes.add(altCode);
      list.push({ ...item, code: altCode });
      disambiguated.push({ series: seriesCode, list: listType, original: item.code, final: altCode });
      return;
    }
  }
  dropped.push({ series: seriesCode, list: listType, code: item.code, reason: "duplicate code" });
}

// ---------------------------------------------------------------------------
// Per-sheet extraction
//
// Series/product-vs-option classification follows the Task 7 spec: within
// M-series, L-Series and Punchline the sheet has a dedicated machine-code
// column (product) separate from an accessory column (option), so we use
// sheet position directly. Software and EasyLoader/EasyFeeder/FabricPro have
// a single flat list per sheet with no such split, so (per spec) everything
// in them is an option -- with the explicit exception of the Leather Nesting
// System's 3 LNS-* rows, which are "clearly standalone systems" and are
// products. This produces 12 (M) + 6 (L) + 2 (Punchline) + 3 (LNS) = 23 base
// machines before the X-Calibre clone, matching the spec's "~23" checkpoint
// exactly. FabricPro's FP-180/FP-220 additionally match the spec's explicit
// "FM/FP models -> products" cue and are standalone machines in their own
// right, so they're classified as FabricPro products (TPL/Crate remain
// options); M-series' FM180 is left as an M-series option since it lives
// structurally in that sheet's accessory column, not its machine column.
// ---------------------------------------------------------------------------

function extractMSeries(wb: XLSX.WorkBook) {
  const ws = getSheet(wb, "M-series");
  const products: CatalogItem[] = [];
  const options: CatalogItem[] = [];
  const seenP = new Set<string>();
  const seenO = new Set<string>();

  // Base machines: rows 5-16, code column B, description column E, price column F.
  // Row 7 (M3390) has no price in the source file -- kept as a needsReview gap.
  for (let row = 5; row <= 16; row++) {
    const code = cellText(ws, `B${row}`);
    if (!code) continue;
    const desc = cellText(ws, `E${row}`);
    const price = cellNumber(ws, `F${row}`);
    register(products, seenP, { code, name: desc, description: desc, price, needsReview: price === null }, "M", "product");
  }

  // Options: rows 17-51, code column C, description column E, price column F.
  for (let row = 17; row <= 51; row++) {
    const code = cellText(ws, `C${row}`);
    if (!code) continue;
    const desc = stripNotes(cellText(ws, `E${row}`));
    const price = cellNumber(ws, `F${row}`);
    // "Drills included" (rows 50-51) share the same code; the description
    // column holds the distinguishing part number, used as a disambiguator.
    register(options, seenO, { code, name: desc, description: desc, price, needsReview: price === null }, "M", "option", desc);
  }

  return { products, options };
}

function extractLSeries(wb: XLSX.WorkBook) {
  const ws = getSheet(wb, "L-Series");
  const products: CatalogItem[] = [];
  const options: CatalogItem[] = [];
  const seenP = new Set<string>();
  const seenO = new Set<string>();

  // Base machines: rows 5-10, code column B, description column E, price column F.
  for (let row = 5; row <= 10; row++) {
    const code = cellText(ws, `B${row}`);
    if (!code) continue;
    const desc = cellText(ws, `E${row}`);
    const price = cellNumber(ws, `F${row}`);
    register(products, seenP, { code, name: desc, description: desc, price, needsReview: price === null }, "L", "product");
  }

  // Options: rows 11-42. Many tool/accessory rows (26-38, 40-42) have no
  // short code in column C -- only a description in column E. Row 39 is a
  // blank spacer row and row 44 is the sheet's "MAXIMUM DISCOUNT..." note,
  // both with neither a code nor a price and so skipped generically.
  for (let row = 11; row <= 42; row++) {
    const desc = cellText(ws, `E${row}`);
    let code = cellText(ws, `C${row}`);
    const hadExplicitCode = code.length > 0;
    const price = cellNumber(ws, `F${row}`);
    if (!desc && !code) continue; // blank spacer row
    if (price === null && !code) continue; // note row with no code and no price
    if (!code) code = desc; // fall back to the (normalized) description as the code
    // Only pass the description as a disambiguator when the code came from a
    // real, distinct code column -- when the code IS the description (the
    // fallback above), appending it to itself can't disambiguate anything;
    // a genuine collision there (e.g. the two identical "3.0mm dia punch"
    // rows) is a true duplicate and should be dropped, not renamed.
    register(
      options, seenO,
      { code, name: desc, description: desc, price, needsReview: price === null },
      "L", "option",
      hadExplicitCode ? desc : undefined
    );
  }

  return { products, options };
}

function extractPunchline(wb: XLSX.WorkBook) {
  const ws = getSheet(wb, "Punchline");
  const products: CatalogItem[] = [];
  const options: CatalogItem[] = [];
  const seenP = new Set<string>();
  const seenO = new Set<string>();

  // Rows 6-8, single code column B, description column D, price column F.
  // P-180 / P-220 are the perforator machines; "Crate" is an accessory.
  for (let row = 6; row <= 8; row++) {
    const code = cellText(ws, `B${row}`);
    if (!code) continue;
    const desc = cellText(ws, `D${row}`);
    const price = cellNumber(ws, `F${row}`);
    const item: CatalogItem = { code, name: desc, description: desc, price, needsReview: price === null };
    if (/^P-\d/.test(code)) register(products, seenP, item, "P", "product");
    else register(options, seenO, item, "P", "option");
  }

  return { products, options };
}

function extractSoftware(wb: XLSX.WorkBook) {
  const ws = getSheet(wb, "Software");
  const options: CatalogItem[] = [];
  const seen = new Set<string>();

  // Rows 5-14: code column A, description column C, price column E.
  for (let row = 5; row <= 14; row++) {
    const code = cellText(ws, `A${row}`);
    if (!code) continue;
    const desc = cellText(ws, `C${row}`);
    const price = cellNumber(ws, `E${row}`);
    register(options, seen, { code, name: desc, description: desc, price, needsReview: price === null }, "SW", "option");
  }

  // LS Convert (row 17) is laid out differently: its own Total formulas
  // (G17/I17/K17) multiply against $F17 -- the same column every other row
  // in this sheet uses for its unit price -- but F17 is blank. A numeric
  // value (9018) does sit in E17, but given the row's own formula wiring
  // treats the price as unset, and per the spec's known-gaps list ("LS
  // Convert" is expected to need review), this is extracted as a missing
  // price rather than trusting the stray E17 value.
  // NOTE: this reads code from row 16 and description from row 17 -- a
  // deliberate two-row straddle specific to LS Convert's current layout in
  // this sheet. If the sheet is ever re-laid-out (rows inserted/removed
  // above/within this block), these two row numbers will need re-verifying
  // by hand; they are not derived from any structural marker.
  const lsCode = cellText(ws, "A16") || "LS Convert";
  const lsDesc = cellText(ws, "C17");
  register(options, seen, { code: lsCode, name: lsDesc, description: lsDesc, price: null, needsReview: true }, "SW", "option");

  return { products: [], options };
}

function extractLNS(wb: XLSX.WorkBook) {
  const ws = getSheet(wb, "Leather Nesting System");
  const products: CatalogItem[] = [];
  const seen = new Set<string>();

  // Rows 5, 9, 13: code column A, description column C, price column E.
  // LNS-2420 and LNS-3220 are formula-priced (=previous * 1.05); the file
  // carries cached results for both (38547.6 and 40474.98), which are used
  // directly -- no needsReview needed unless a cached value is ever absent.
  for (const row of [5, 9, 13]) {
    const code = cellText(ws, `A${row}`);
    const desc = cellText(ws, `C${row}`);
    const price = cellNumber(ws, `E${row}`);
    register(products, seen, { code, name: desc, description: desc, price, needsReview: price === null }, "LNS", "product");
  }

  return { products, options: [] as CatalogItem[] };
}

function extractEasyLoader(wb: XLSX.WorkBook) {
  const ws = getSheet(wb, "EasyLoader");
  const options: CatalogItem[] = [];
  const seen = new Set<string>();

  // No short-code column on this sheet -- component descriptions (column D)
  // repeat verbatim across the two width groups (e.g. "Additional 1.2M
  // lengths" appears in both), so each row is prefixed with its group's
  // width tag (read from the group header in column A) to keep codes unique.
  const groups: { tag: string; rows: number[] }[] = [
    { tag: "2020", rows: [7, 8, 9, 10, 11, 12, 13, 14] }, // "EasyLoader- 2020 width..." (A7)
    { tag: "2420", rows: [21, 22, 23, 24, 25, 26, 27, 28] }, // "EasyLoader- 2420 width..." (A21)
  ];

  for (const group of groups) {
    for (const row of group.rows) {
      const rawDesc = cellText(ws, `D${row}`);
      if (!rawDesc) continue;
      const desc = stripNotes(rawDesc);
      const price = cellNumber(ws, `F${row}`);
      if (price === null) continue; // no priced item on this row
      const code = `EL-${group.tag} ${desc}`;
      register(options, seen, { code, name: desc, description: desc, price, needsReview: false }, "EL", "option");
    }
  }

  return { products: [] as CatalogItem[], options };
}

function extractEasyFeeder(wb: XLSX.WorkBook) {
  const ws = getSheet(wb, "EasyFeeder");
  const options: CatalogItem[] = [];
  const seen = new Set<string>();

  // Rows 8, 10, 12: code column A, description column D, price column E.
  for (const row of [8, 10, 12]) {
    const code = cellText(ws, `A${row}`);
    const desc = cellText(ws, `D${row}`);
    const price = cellNumber(ws, `E${row}`);
    register(options, seen, { code, name: desc, description: desc, price, needsReview: price === null }, "EF", "option");
  }

  return { products: [] as CatalogItem[], options };
}

function extractFabricPro(wb: XLSX.WorkBook) {
  const ws = getSheet(wb, "FabricPro");
  const products: CatalogItem[] = [];
  const options: CatalogItem[] = [];
  const seenP = new Set<string>();
  const seenO = new Set<string>();

  // Rows 7-10: code column C, description column D, price column J.
  // FP-180 / FP-220 are the spreader machines (product); TPL (price 0,
  // included as standard equipment) and Crate are accessories (option).
  // TPL's price cell (J9) is a genuine 0 -- checked every other cell in the
  // row (D-K) and none carries a real number instead. A price of exactly 0
  // isn't a usable sale price even though it's not blank, so it's flagged
  // needsReview rather than trusted at face value (per Task spec point D).
  for (const row of [7, 8, 9, 10]) {
    const code = cellText(ws, `C${row}`);
    if (!code) continue;
    const desc = cellText(ws, `D${row}`);
    const price = cellNumber(ws, `J${row}`);
    const item: CatalogItem = { code, name: desc, description: desc, price, needsReview: price === null || price === 0 };
    if (/^FP-\d/.test(code)) register(products, seenP, item, "FP", "product");
    else register(options, seenO, item, "FP", "option");
  }

  return { products, options };
}

// ---------------------------------------------------------------------------
// Cross-sheet option merging
//
// Options are global (1:1 with the DB's Option model); series affinity is
// expressed via compatibleSeries (1:1 with OptionCompatibility) rather than
// which sheet's options[] an item lived in. 12 option codes are duplicated
// across sheets in the source file (same short code, different accessory
// per machine line). For each duplicated code:
//   - If every sheet prices it identically, it's genuinely one option sold
//     across multiple lines -> merge into a single option, union the
//     compatible series.
//   - If sheets disagree on price, it's NOT the same option -- keep them
//     separate, with the series code suffixed onto every variant's code
//     (e.g. "ABR-M", "ABR-L") so the base code is never ambiguously reused.
// Every option pulled from the M-series sheet is also compatible with
// X-Calibre (XC clones M's machines and is expected to reuse M's options).
// ---------------------------------------------------------------------------

function compatibleSeriesFor(seriesCode: string): string[] {
  return seriesCode === "M" ? ["M", "XC"] : [seriesCode];
}

function buildGlobalOptions(seriesOptionsList: SeriesOptions[]): GlobalOption[] {
  const byCode = new Map<string, { seriesCode: string; item: CatalogItem }[]>();
  for (const { seriesCode, options } of seriesOptionsList) {
    for (const item of options) {
      const entries = byCode.get(item.code) ?? [];
      entries.push({ seriesCode, item });
      byCode.set(item.code, entries);
    }
  }

  const result: GlobalOption[] = [];
  for (const [code, entries] of byCode) {
    if (entries.length === 1) {
      const { seriesCode, item } = entries[0];
      result.push({
        code: item.code,
        name: item.name,
        description: item.description,
        price: item.price,
        needsReview: item.needsReview,
        compatibleSeries: compatibleSeriesFor(seriesCode),
      });
      continue;
    }

    const prices = entries.map((e) => e.item.price);
    const allSamePrice = prices.every((p) => p === prices[0]);

    if (allSamePrice) {
      const first = entries[0]; // insertion order == series extraction order (M, L, P, SW, LNS, EL, EF, FP)
      const compatibleSeries = Array.from(new Set(entries.flatMap((e) => compatibleSeriesFor(e.seriesCode))));
      result.push({
        code,
        name: first.item.name,
        description: first.item.description,
        price: first.item.price,
        needsReview: entries.some((e) => e.item.needsReview),
        compatibleSeries,
      });
      merged.push({ code, seriesCodes: entries.map((e) => e.seriesCode), price: first.item.price });
    } else {
      const variants: SplitEntry["variants"] = [];
      for (const { seriesCode, item } of entries) {
        const finalCode = `${code}-${seriesCode}`;
        result.push({
          code: finalCode,
          name: item.name,
          description: item.description,
          price: item.price,
          needsReview: item.needsReview,
          compatibleSeries: compatibleSeriesFor(seriesCode),
        });
        variants.push({ seriesCode, finalCode, price: item.price });
      }
      split.push({ code, variants });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function sortByCode<T extends { code: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.code.localeCompare(b.code, "en"));
}

function main(): void {
  if (!fs.existsSync(SOURCE_XLSX)) {
    console.error(`Source workbook not found: ${SOURCE_XLSX}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(SOURCE_XLSX);

  const m = extractMSeries(wb);
  const l = extractLSeries(wb);
  const p = extractPunchline(wb);
  const sw = extractSoftware(wb);
  const lns = extractLNS(wb);
  const el = extractEasyLoader(wb);
  const ef = extractEasyFeeder(wb);
  const fp = extractFabricPro(wb);

  const series: CatalogSeries[] = [
    { seriesCode: "M", seriesName: "M-Series", maxDiscountPct: null, products: sortByCode(m.products) },
    { seriesCode: "L", seriesName: "L-Series", maxDiscountPct: 10, products: sortByCode(l.products) },
    { seriesCode: "P", seriesName: "Punchline", maxDiscountPct: null, products: sortByCode(p.products) },
    { seriesCode: "SW", seriesName: "Software", maxDiscountPct: null, products: sortByCode(sw.products) },
    { seriesCode: "LNS", seriesName: "Leather Nesting System", maxDiscountPct: null, products: sortByCode(lns.products) },
    { seriesCode: "EL", seriesName: "EasyLoader", maxDiscountPct: null, products: sortByCode(el.products) },
    { seriesCode: "EF", seriesName: "EasyFeeder", maxDiscountPct: null, products: sortByCode(ef.products) },
    { seriesCode: "FP", seriesName: "FabricPro", maxDiscountPct: null, products: sortByCode(fp.products) },
  ];

  // Cross-sheet option merge, in the same M/L/P/SW/LNS/EL/EF/FP order used
  // above -- see buildGlobalOptions for the merge/split rule.
  const options = sortByCode(
    buildGlobalOptions([
      { seriesCode: "M", options: m.options },
      { seriesCode: "L", options: l.options },
      { seriesCode: "P", options: p.options },
      { seriesCode: "SW", options: sw.options },
      { seriesCode: "LNS", options: lns.options },
      { seriesCode: "EL", options: el.options },
      { seriesCode: "EF", options: ef.options },
      { seriesCode: "FP", options: fp.options },
    ])
  );

  // X-Calibre: a distinct sellable line built on M-Series' machine specs.
  // Cloned from the already-extracted M products; codes drop the leading
  // "M" and gain an "XC-" prefix (M3180 -> XC-3180). Prices are copied
  // as-is but flagged needsReview because X-Calibre-specific pricing is not
  // yet published in the source file -- these are provisional placeholders.
  // XC is expected to reuse M-Series' options via compatibleSeries (every
  // M-sheet option already lists "XC"), not via a duplicated options list.
  const mSeries = series.find((s) => s.seriesCode === "M")!;
  const xcSeries: CatalogSeries = {
    seriesCode: "XC",
    seriesName: "X-Calibre",
    maxDiscountPct: null,
    products: sortByCode(
      mSeries.products.map((prod) => ({
        ...prod,
        code: `XC-${prod.code.replace(/^M/, "")}`,
        needsReview: true,
      }))
    ),
  };
  series.unshift(xcSeries); // "insert at position 1" => first entry in the array

  const catalog = {
    extractedAt: new Date().toISOString(),
    series,
    options,
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(catalog, null, 2) + "\n");

  printSummary(series, options);
}

function printSummary(series: CatalogSeries[], options: GlobalOption[]): void {
  console.log("\nCatalog extraction summary");
  console.log("===========================");

  let totalProducts = 0;
  const rows: string[][] = [["Series", "Products"]];
  for (const s of series) {
    rows.push([`${s.seriesCode} (${s.seriesName})`, String(s.products.length)]);
    totalProducts += s.products.length;
  }
  rows.push(["TOTAL", String(totalProducts)]);
  const widths = [0, 1].map((i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i])).join("  |  "));
  console.log(`\nGlobal options: ${options.length}`);

  console.log("\nneedsReview items:");
  let anyReview = false;
  for (const s of series) {
    for (const item of s.products) {
      if (item.needsReview) {
        anyReview = true;
        console.log(`  [${s.seriesCode}/product] ${item.code}  price=${item.price ?? "null"}`);
      }
    }
  }
  for (const item of options) {
    if (item.needsReview) {
      anyReview = true;
      console.log(`  [option] ${item.code}  price=${item.price ?? "null"}`);
    }
  }
  if (!anyReview) console.log("  (none)");

  if (disambiguated.length) {
    console.log("\nDisambiguated (duplicate code, distinguished by description):");
    for (const d of disambiguated) console.log(`  [${d.series}/${d.list}] "${d.original}" -> "${d.final}"`);
  }

  if (dropped.length) {
    console.log("\nDropped (duplicate code, first occurrence kept):");
    for (const d of dropped) console.log(`  [${d.series}/${d.list}] ${d.code} -- ${d.reason}`);
  }

  if (merged.length) {
    console.log("\nMerged options (same price across sheets -> single global option):");
    for (const m of merged) console.log(`  ${m.code}  price=${m.price ?? "null"}  series=[${m.seriesCodes.join(", ")}]`);
  }

  if (split.length) {
    console.log("\nSplit options (differing price across sheets -> series-suffixed codes):");
    for (const s of split) {
      const parts = s.variants.map((v) => `${v.finalCode}=${v.price ?? "null"}`).join(", ");
      console.log(`  ${s.code} -> ${parts}`);
    }
  }

  console.log(`\nWrote ${path.relative(ROOT, OUTPUT_JSON)}`);
}

main();
