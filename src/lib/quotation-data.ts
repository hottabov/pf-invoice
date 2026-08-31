// Pure assembly for the extended quotation renderer (Phase 6): turns a
// loaded document plus its resolved ContentBlock rows into `QuotationData`,
// the flat shape `QuotationSheet` (src/components/sheet/quotation-sheet.tsx)
// renders. Mirrors src/lib/sheet-data.ts's discipline exactly — no
// `@/lib/db` or `next/*` imports, so a plain `vitest run` of this file never
// needs `DATABASE_URL` set — and reuses `toSheetData` for everything a
// quotation shares with the plain document sheet (entity/client header,
// investment-summary items+totals). The input types below are declared from
// scratch (not imported from src/lib/queries/documents.ts) for the same
// reason `ToSheetDataDoc` is: TypeScript's structural typing means the real
// `DocumentForBuilder` satisfies `QuotationDataDoc` without either file
// importing the other, as long as `DocumentForBuilder`'s items carry the
// extra fields (`specs`, `seriesCode`, `serialNumber`) this module needs.
import { machineSpecSentence, parseMachineSpecs } from "./machine-specs";
import { renderMarkdown } from "./markdown";
import {
  toSheetData,
  type DocSheetClient,
  type DocSheetData,
  type DocSheetEntity,
  type DocSheetItem,
  type DocSheetLine,
  type DocSheetTotals,
  type ImageResolver,
  type ToSheetCompanyInput,
  type ToSheetContactInput,
  type ToSheetDataDoc,
  type ToSheetItemInput,
  type ToSheetLineInput,
} from "./sheet-data";

const identityResolver: ImageResolver = (url) => url;

// --- input shape -------------------------------------------------------------

export type QuotationLineInput = ToSheetLineInput & {
  kind: "OPTION" | "PRODUCT" | "CUSTOM";
  /** `DocumentLine.attributes` (e.g. `{ metres: 4, tables: 2 }`) — feeds
   * `substitutePlaceholders` for option blocks like `option.MTS` whose body
   * references `{{metres}}`/`{{tables}}`. */
  attributes: Record<string, string | number> | null;
};

export type QuotationItemInput = ToSheetItemInput & {
  /** `DocumentItem.serialNumber` — used as-is (blank when unset) in the RSP
   * coverage table; never a placeholder-substitution concern. */
  serialNumber: string | null;
  /** The item's product's series code (e.g. "M", "X", "EL") — see
   * `productBlockKey`. `null` for a snapshot item whose product no longer
   * resolves a series. */
  seriesCode: string | null;
  /** `Product.specs` exactly as stored (opaque `Json?`) — validated
   * defensively at runtime, same treatment as `entitySnapshot`/`bankDetails`
   * in sheet-data.ts. */
  specs: unknown;
  lines: QuotationLineInput[];
};

/** Same shape as `ToSheetDataDoc` plus the extra fields needed for the
 * quotation renderer: `regionId` (to resolve region-specific content-block
 * overrides), richer `items` (see `QuotationItemInput`), and the two
 * quotation-first pricing-display toggles (see `setPriceDisplay` in
 * src/lib/actions/documents.ts) that gate per-item/per-option amounts in
 * the investment summary and the `{{price}}` token in a machine title
 * block — the grand total itself is never gated by either flag. */
export type QuotationDataDoc = Omit<ToSheetDataDoc, "items"> & {
  regionId: string;
  items: QuotationItemInput[];
  showItemPrices: boolean;
  showOptionPrices: boolean;
};

/** A `ContentBlock` row exactly as stored — `regionId: null` is the global
 * default, a non-null `regionId` is a region-specific override sharing the
 * same `key` (enforced by the `@@unique([key, regionId])` constraint). */
export type ContentBlockRow = {
  key: string;
  regionId: string | null;
  title: string | null;
  body: string;
  sortOrder: number;
};

// --- resolveBlocks -----------------------------------------------------------

export type ResolvedContentBlock = {
  key: string;
  title: string | null;
  body: string;
  sortOrder: number;
};

/**
 * Reduces every `ContentBlock` row (defaults + every region's overrides —
 * see `getContentBlocksForRegion`) down to one row per key for `regionId`:
 * the region's own override when one exists, otherwise the global default.
 * Rows for a *different* region are ignored entirely (never shadow a
 * default some other region hasn't overridden). Implemented as two passes
 * — defaults first, then overrides for `regionId` — so an override always
 * wins regardless of array order.
 */
export function resolveBlocks(blocks: ContentBlockRow[], regionId: string): Map<string, ResolvedContentBlock> {
  const resolved = new Map<string, ResolvedContentBlock>();

  for (const block of blocks) {
    if (block.regionId !== null) continue;
    resolved.set(block.key, { key: block.key, title: block.title, body: block.body, sortOrder: block.sortOrder });
  }

  for (const block of blocks) {
    if (block.regionId !== regionId) continue;
    resolved.set(block.key, { key: block.key, title: block.title, body: block.body, sortOrder: block.sortOrder });
  }

  return resolved;
}

// --- key mapping ---------------------------------------------------------

/**
 * Candidate `ContentBlock` keys for an option line's code, in priority
 * order: the exact code first (e.g. "ABR-M" -> "option.ABR-M"), then — only
 * when the code contains a "-" — the code with its trailing series suffix
 * stripped (e.g. "ABR-M" -> "option.ABR", "ABR-FP" -> "option.ABR"). A code
 * with no "-" only ever produces the one exact candidate.
 *
 * Fabric Master ("FM180") no longer needs a special-case fallback here: it
 * was catalogued as an M/X-series option with no standalone product to
 * route through `productBlockKey`, but the option itself was retired (not
 * sold anymore, owner decision — see RETIRED_OPTION_CODES in prisma/seed.ts)
 * and dropped from extraction entirely (scripts/extract-catalog.ts), so no
 * document can add a new "FM180" line any more. The `equipment.fabric-master`
 * content block itself is left in place (harmless — content blocks with no
 * matching option are simply never rendered).
 *
 * Callers should try each candidate against the resolved blocks map in
 * order and use the first hit, skipping the option entirely if none
 * resolve.
 */
export function optionBlockKey(code: string): string[] {
  const candidates = [`option.${code}`];
  const lastDash = code.lastIndexOf("-");
  if (lastDash > 0) {
    const stripped = code.slice(0, lastDash);
    const strippedKey = `option.${stripped}`;
    if (!candidates.includes(strippedKey)) candidates.push(strippedKey);
  }
  return candidates;
}

/**
 * The single `ContentBlock` key for a machine/equipment item's product, or
 * `null` when nothing in the content library covers it (item still renders,
 * just without a `titleBlockHtml`). Mapping is by series code:
 *  - "M" / "X" (the cutting-machine series) -> "machine.m-series"
 *  - "EL" (Easy-Loader) -> "equipment.easy-loader"
 *  - "FP" (Fabric Pro) -> "equipment.fabric-pro"
 *  - "P" (Punchline) -> "equipment.punchline"
 *  - "SW" (software) -> "software.pathworks-s" for a "(S)"-suffixed code
 *    (standalone), "software.pathworks-i" for an "(I)"-suffixed code
 *    (integrated), else `null` (an unrecognised SW variant)
 *  - anything else (including "EF", which has no matching content block,
 *    and "L"/"LNS") -> `null`
 */
export function productBlockKey(productCode: string, seriesCode: string | null): string | null {
  switch (seriesCode) {
    case "M":
    case "X":
      return "machine.m-series";
    case "EL":
      return "equipment.easy-loader";
    case "FP":
      return "equipment.fabric-pro";
    case "P":
      return "equipment.punchline";
    case "SW": {
      const upper = productCode.toUpperCase();
      if (upper.includes("(S)")) return "software.pathworks-s";
      if (upper.includes("(I)")) return "software.pathworks-i";
      return null;
    }
    default:
      return null;
  }
}

// --- RSP coverage --------------------------------------------------------

/**
 * Series codes that identify a cutting machine (as opposed to an accessory
 * or software product) for the RSP coverage table — see
 * `buildQuotationData`'s `coverageRows`. Kept separate from
 * `productBlockKey`'s switch because the two questions differ: this is
 * "is this a machine at all" (RSP coverage), that is "which content block
 * describes this specific product".
 */
const MACHINE_SERIES_CODES = new Set(["M", "X", "L", "P", "LNS"]);

/**
 * Display name per series code, for the one piece of prose
 * `machineSpecSentence` needs that the code itself doesn't encode — e.g.
 * "M3390" parses to a height+width but has no way to know it should read
 * "M-Series" rather than "M". Limited to the three series
 * `parseMachineSpecs` actually recognises; any other series code falls back
 * to the raw code itself (moot in practice, since `machineSpecSentence`
 * returns `null` for those series regardless of the name it's given).
 */
const SERIES_DISPLAY_NAMES: Record<string, string> = { M: "M-Series", X: "X-Calibre", L: "L-Series" };

// --- substitutePlaceholders ------------------------------------------------

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Replaces every `{{token}}` in `body` with `vars[token]`; a token with no
 * entry in `vars` (or an empty-string value) renders as `"____"` — a plain,
 * unmistakably-unfilled blank the author can spot and fill in by hand
 * (RSP unit cost, delivery weeks, and similar figures this module has no
 * data source for) rather than silently dropping the placeholder or leaking
 * the raw `{{token}}` syntax into a customer-facing PDF.
 */
export function substitutePlaceholders(body: string, vars: Record<string, string>): string {
  return body.replace(PLACEHOLDER_PATTERN, (_match, token: string) => {
    const value = vars[token];
    return value !== undefined && value !== "" ? value : "____";
  });
}

// --- buildQuotationData ----------------------------------------------------

export type QuotationOptionBlock = {
  key: string;
  bodyHtml: string;
};

export type QuotationMachineSection = {
  itemId: string;
  /** Rendered `machine.*`/`equipment.*`/`software.*` block for this item's
   * product, with `{{model}}`/`{{price}}`/`{{cutHeightCm}}`/`{{cutWidthCm}}`/
   * `{{specSentence}}` substituted — `null` when `productBlockKey` found no
   * matching block, in which case the sheet renders `specSentence`
   * (alongside the item's name/price from `lineSummary`) as a minimal
   * auto-generated section instead — see quotation-sheet.tsx. */
  titleBlockHtml: string | null;
  /** One-line spec summary derived purely from the product code (see
   * `machineSpecSentence` in src/lib/machine-specs.ts) — e.g. "M-Series
   * Cutting Machine, 3cm compressed lay height, 390cm cutting width".
   * `null` when the series/code isn't one `parseMachineSpecs` recognises
   * (most non-cutting-machine products, or a malformed code). */
  specSentence: string | null;
  /** One rendered `option.*` block per OPTION line whose code resolves to a
   * block (see `optionBlockKey`) — a line with no matching block is simply
   * omitted, never rendered as a raw/blank entry. */
  optionBlocksHtml: QuotationOptionBlock[];
  /** This item's own row from `DocSheetData.items` (name/price/lines/total)
   * — reused as-is for the investment-summary table rather than
   * recomputed. */
  lineSummary: DocSheetItem;
};

export type QuotationBlockSection = {
  key: string;
  title: string | null;
  bodyHtml: string;
};

export type QuotationRspRow = {
  name: string;
  serialNumber: string;
  rspUnitCost: string;
};

export type QuotationData = {
  isDraft: boolean;
  number: string | null;
  issueDate: string;
  validityDate: string | null;
  logo: string | null;
  entity: DocSheetEntity;
  client: DocSheetClient | null;
  machineSections: QuotationMachineSection[];
  items: DocSheetItem[];
  extraLines: DocSheetLine[];
  totals: DocSheetTotals;
  /** `terms.*` blocks, sorted by `sortOrder` (matches seed order: delivery,
   * installation, schedule, customer-responsibilities, warranty, rsp,
   * payment). */
  termsSections: QuotationBlockSection[];
  /** `conditions.1`..`conditions.14`, sorted by `sortOrder` — never by key
   * text, which would sort "conditions.10" before "conditions.2". */
  conditionsSections: QuotationBlockSection[];
  rsp: {
    agreementHtml: string | null;
    coverageRows: QuotationRspRow[];
  };
  showSignature: boolean;
  /** Pass-through of `QuotationDataDoc`'s toggles for `QuotationSheet` to
   * gate the investment summary's per-item/per-option amount columns —
   * `showOptionPrices` implies item totals are visible too (an option's
   * price only makes sense next to the item it's attached to), which is why
   * the sheet treats `showItemPrices || showOptionPrices` as "item amounts
   * visible" rather than reading `showItemPrices` alone. */
  showItemPrices: boolean;
  showOptionPrices: boolean;
};

export type BuildQuotationDataOpts = {
  resolveImage?: ImageResolver;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function specString(specs: unknown, key: string): string {
  if (!isPlainObject(specs)) return "";
  const value = specs[key];
  if (value === undefined || value === null) return "";
  return String(value);
}

function attributeVars(attributes: Record<string, string | number> | null): Record<string, string> {
  if (!attributes) return {};
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    vars[key] = String(value);
  }
  return vars;
}

function collectByPrefix(
  resolved: Map<string, ResolvedContentBlock>,
  prefix: string,
  vars: Record<string, string>
): QuotationBlockSection[] {
  return Array.from(resolved.values())
    .filter((block) => block.key === prefix || block.key.startsWith(`${prefix}.`))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((block) => ({
      key: block.key,
      title: block.title,
      bodyHtml: renderMarkdown(substitutePlaceholders(block.body, vars)),
    }));
}

/**
 * Assembles `QuotationData` from a loaded QUOTE document (`doc`) and the
 * full set of `ContentBlock` rows visible to its region (`blocks` — pass
 * `getContentBlocksForRegion(doc.regionId)`'s result). `opts.resolveImage`
 * behaves exactly like `toSheetData`'s (identity for the in-app preview,
 * `fileImageResolver` for the PDF pipeline — Gotenberg's headless Chromium
 * can't hit an auth-gated `/api/files/...` URL).
 */
export function buildQuotationData(
  doc: QuotationDataDoc,
  blocks: ContentBlockRow[],
  opts: BuildQuotationDataOpts = {}
): QuotationData {
  const resolveImage = opts.resolveImage ?? identityResolver;
  const sheet: DocSheetData = toSheetData(doc, resolveImage);
  const resolved = resolveBlocks(blocks, doc.regionId);

  const sheetItemsById = new Map(sheet.items.map((item) => [item.id, item]));

  // `showOptionPrices` implies item totals are visible too (see
  // `QuotationData.showItemPrices`'s doc comment) — this is the one flag a
  // machine title block's `{{price}}` token cares about.
  const itemPriceVisible = doc.showItemPrices || doc.showOptionPrices;

  const machineSections: QuotationMachineSection[] = doc.items.map((item) => {
    const lineSummary = sheetItemsById.get(item.id);
    if (!lineSummary) {
      // Defensive only — sheet.items is derived 1:1 from doc.items by
      // toSheetData, so every id here always has a match.
      throw new Error(`buildQuotationData: no sheet item for document item ${item.id}`);
    }

    // Code parsing is authoritative for a machine's cutting specs (per the
    // owner's domain rule — catalog descriptions can be wrong, e.g. some
    // "220"-width codes are mis-described as "227cm" in the source
    // catalog). Only fall back to the item's stored `specs` JSON when the
    // code doesn't parse against its series' known scheme (an unrecognised
    // series, or a malformed code) — that's the pre-existing behavior this
    // module had before code parsing existed, preserved as-is.
    const parsedSpecs = parseMachineSpecs(item.seriesCode, item.code);
    const cutHeightCm =
      parsedSpecs?.heightCm !== undefined ? String(parsedSpecs.heightCm) : specString(item.specs, "cutHeightCm");
    const cutWidthCm =
      parsedSpecs?.widthCm !== undefined ? String(parsedSpecs.widthCm) : specString(item.specs, "cutWidthCm");
    const seriesDisplayName = item.seriesCode ? (SERIES_DISPLAY_NAMES[item.seriesCode] ?? item.seriesCode) : "";
    const specSentence = machineSpecSentence(seriesDisplayName, item.seriesCode, item.code);

    const blockKey = productBlockKey(item.code, item.seriesCode);
    const block = blockKey ? resolved.get(blockKey) : undefined;
    const titleBlockHtml = block
      ? renderMarkdown(
          substitutePlaceholders(block.body, {
            model: item.code,
            cutHeightCm,
            cutWidthCm,
            ...(specSentence ? { specSentence } : {}),
            // Only fed in when the price toggle allows it — an admin-authored
            // block like machine.m-series bakes "**Price: {{price}}**"
            // straight into its markdown, so this is the only lever that
            // controls whether that line renders a real figure or the
            // standard "____" blank-data marker (see substitutePlaceholders).
            // No option.* block currently references {{price}} at all — an
            // option's price only ever shows in the investment summary table
            // (gated separately there by `showOptionPrices`), so there's
            // nothing analogous to thread through `attributeVars` below.
            ...(itemPriceVisible ? { price: item.unitPrice } : {}),
          })
        )
      : null;

    const optionBlocksHtml: QuotationOptionBlock[] = [];
    for (const line of item.lines) {
      if (line.kind !== "OPTION" || !line.code) continue;
      const candidates = optionBlockKey(line.code);
      const found = candidates.map((key) => resolved.get(key)).find((b) => b !== undefined);
      if (!found) continue;
      optionBlocksHtml.push({
        key: found.key,
        bodyHtml: renderMarkdown(substitutePlaceholders(found.body, attributeVars(line.attributes))),
      });
    }

    return { itemId: item.id, titleBlockHtml, specSentence, optionBlocksHtml, lineSummary };
  });

  const bankDetailsText = sheet.entity.bankDetails.map((row) => `${row.label}: ${row.value}`).join("\n");
  const globalVars: Record<string, string> = { bankDetails: bankDetailsText };

  const termsSections = collectByPrefix(resolved, "terms", globalVars);
  const conditionsSections = collectByPrefix(resolved, "conditions", globalVars);

  const rspAgreement = resolved.get("rsp.agreement");
  const agreementHtml = rspAgreement ? renderMarkdown(substitutePlaceholders(rspAgreement.body, globalVars)) : null;

  const coverageRows: QuotationRspRow[] = doc.items
    .filter((item) => MACHINE_SERIES_CODES.has(item.seriesCode ?? "") || Boolean(item.serialNumber))
    .map((item) => ({
      name: item.name,
      serialNumber: item.serialNumber ?? "",
      rspUnitCost: "____",
    }));

  return {
    isDraft: sheet.isDraft,
    number: sheet.number,
    issueDate: sheet.issueDate,
    validityDate: sheet.validityDate,
    logo: sheet.logo,
    entity: sheet.entity,
    client: sheet.client,
    machineSections,
    items: sheet.items,
    extraLines: sheet.extraLines,
    totals: sheet.totals,
    termsSections,
    conditionsSections,
    rsp: { agreementHtml, coverageRows },
    showSignature: sheet.showSignature,
    showItemPrices: doc.showItemPrices,
    showOptionPrices: doc.showOptionPrices,
  };
}

// Re-exported so callers building a `QuotationDataDoc` from scratch (tests,
// or a future mapper) can reference the same input types this module
// consumes without reaching back into sheet-data.ts themselves.
export type { ToSheetCompanyInput, ToSheetContactInput };
