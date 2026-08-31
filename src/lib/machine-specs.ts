// Pure machine-code parsing for quotations (Phase 6 follow-up). Per the
// owner's domain rule, Pathfinder machine codes *encode* their specs — the
// digits in the code are the source of truth, and a catalog product
// description can be wrong (see docs/reference/price-list-analysis.md's
// "227cm" descriptions on nominally-220-wide codes, and L-Series
// descriptions that don't even mention the code's own width). This module
// never touches the DB or `next/*` — same discipline as sheet-data.ts and
// quotation-data.ts — so a plain `vitest run` of it never needs
// `DATABASE_URL` set.
//
// Two series families are recognised:
//  - M-Series ("M") / X-Calibre ("X"): code is `M<h><w>` or `X-<h><w>`
//    (e.g. "M3390", "X-3180") — `<h>` is a 1-2 digit compressed-lay cutting
//    height in cm (one of 3, 5, 7, 10), `<w>` is the cutting width in cm
//    (one of 180, 220, 390). Both a bare "M"/"X" prefix and a "M-"/"X-"
//    prefix are accepted, since the catalog uses "M3390" but "X-3390".
//  - L-Series ("L"): code is `L-<w>` or `L-<w>F` (e.g. "L-320", "L-180F") —
//    `<w>` is the cutting width in cm only; the code carries no height at
//    all, and a trailing "F" is a belt-material variant marker to be kept
//    as-is wherever the raw code itself is rendered, never stripped from
//    the code text.
//
// Any other series code (or a code that doesn't match its series' pattern,
// e.g. a typo'd "M999") parses to `null` — callers fall back to whatever
// other spec source they already have (see quotation-data.ts's
// `specString(item.specs, ...)` fallback).

export type MachineSpecs = {
  heightCm?: number;
  widthCm?: number;
};

// `[MX]` covers both series' code prefixes (X-Calibre codes are written
// "X-...", never "XC-..."); the "-" is optional so "M3390" and "X-3390"
// both match. `(\d{1,2})` is intentionally greedy-then-backtracking — e.g.
// "3390" first tries a 2-digit height ("33"), fails against the width
// alternation, and backtracks to a 1-digit height ("3") + "390".
const M_XC_PATTERN = /^[MX]-?(\d{1,2})(180|220|390)$/;

// L-Series has no height in its code at all — just a width, optionally
// followed by a single "F" variant suffix (kept out of the capture group
// since it's not part of the width).
const L_PATTERN = /^L-(\d{2,3})F?$/;

/**
 * Parses a product code against its series' known spec-encoding scheme.
 * Returns `null` when `seriesCode` isn't one of the recognised
 * spec-encoding series ("M", "X", "L"), or when `productCode` doesn't
 * match that series' pattern.
 */
export function parseMachineSpecs(seriesCode: string | null, productCode: string): MachineSpecs | null {
  if (seriesCode === "M" || seriesCode === "X") {
    const match = M_XC_PATTERN.exec(productCode);
    if (!match) return null;
    return { heightCm: Number(match[1]), widthCm: Number(match[2]) };
  }

  if (seriesCode === "L") {
    const match = L_PATTERN.exec(productCode);
    if (!match) return null;
    return { widthCm: Number(match[1]) };
  }

  return null;
}

/**
 * A human-readable one-line spec summary derived purely from the product
 * code, e.g. `"M-Series Cutting Machine, 3cm compressed lay height, 390cm
 * cutting width"` (M/X — both dimensions) or `"L-Series Cutting Machine
 * with 320cm cutting width"` (L — width only, no height in the code to
 * report). Returns `null` whenever `parseMachineSpecs` does (unrecognised
 * series, or a code that doesn't match its series' pattern) — never a
 * sentence with a missing/blank dimension spliced in.
 */
export function machineSpecSentence(seriesName: string, seriesCode: string | null, code: string): string | null {
  const specs = parseMachineSpecs(seriesCode, code);
  if (!specs) return null;

  if (seriesCode === "M" || seriesCode === "X") {
    if (specs.heightCm === undefined || specs.widthCm === undefined) return null;
    return `${seriesName} Cutting Machine, ${specs.heightCm}cm compressed lay height, ${specs.widthCm}cm cutting width`;
  }

  if (seriesCode === "L") {
    if (specs.widthCm === undefined) return null;
    return `${seriesName} Cutting Machine with ${specs.widthCm}cm cutting width`;
  }

  return null;
}

/**
 * Resolves width placeholder variables from product code for series that
 * don't have spec-encoding schemes but still have width information:
 *  - EL (Easy-Loader) codes like "EL-2020" extract tableWidthMm from the
 *    4-digit code suffix: `{ tableWidthMm: "2020" }`
 *  - P (Punchline) codes have fixed mappings: P-180 → `{ paperWidthMm: "1880" }`,
 *    P-220 → `{ paperWidthMm: "2280" }`
 *  - All other series/codes return `{}`
 */
export function extraSpecVars(seriesCode: string, code: string): Record<string, string> {
  // EL (Easy-Loader): EL-XXXX pattern, extract the 4-digit width
  if (seriesCode === "EL") {
    const elMatch = /^EL-(\d{4})$/.exec(code);
    if (elMatch) {
      return { tableWidthMm: elMatch[1] };
    }
  }

  // P (Punchline): fixed mappings from product code to paper width
  if (seriesCode === "P") {
    if (code === "P-180") {
      return { paperWidthMm: "1880" };
    }
    if (code === "P-220") {
      return { paperWidthMm: "2280" };
    }
  }

  return {};
}
