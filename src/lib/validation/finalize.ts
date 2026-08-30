// Pure finalize-eligibility check, split out of src/lib/actions/finalize.ts
// for the same reason src/lib/validation/documents.ts is split out of
// src/lib/actions/documents.ts: this file must have zero `@/lib/db` or
// `next/*` imports (importing `@/lib/db` eagerly constructs a Prisma client
// against `DATABASE_URL`, which isn't set — and shouldn't need to be — for
// a plain `vitest run` of pure logic; see tests/finalize-validation.test.ts).
// The only import here is `EngineViolation`, a plain type from the
// dependency-free pricing engine (src/lib/pricing.ts).
import type { EngineViolation } from "../pricing";

/** The minimal shape `validateFinalizable` needs — deliberately not typed
 * against Prisma's generated `Document` payload so this stays trivial to
 * unit test with hand-built fixtures. `lines` is expected to already be
 * narrowed to document-level lines the way `finalizeDocument` loads them
 * (`lines: { where: { itemId: null } }`) — but the `itemId` check is still
 * applied here defensively in case a caller passes an unfiltered list. */
export type FinalizableDocument = {
  companyId: string | null;
  items: unknown[];
  lines: { itemId: string | null }[];
};

/**
 * Returns a human-readable reason the document can't be finalized, or
 * `null` when it's ready. Checked in this order so a caller only ever sees
 * one actionable message at a time:
 *   1. no client selected yet;
 *   2. nothing to bill — zero items AND zero document-level lines;
 *   3. the pricing engine flagged a discount above its series cap (an item
 *      discount can end up violating its cap after the fact if an admin
 *      lowers `Series.maxDiscountPct` later — see the NOTE on
 *      `recalcDocument` in src/lib/actions/documents.ts — so this must be
 *      re-checked at finalize time, not just at save time).
 */
export function validateFinalizable(
  doc: FinalizableDocument,
  violations: EngineViolation[]
): string | null {
  if (!doc.companyId) {
    return "Select a client before finalizing";
  }

  const hasDocumentLevelLines = doc.lines.some((line) => line.itemId === null);
  if (doc.items.length === 0 && !hasDocumentLevelLines) {
    return "Add at least one item or line before finalizing";
  }

  if (violations.length > 0) {
    const detail = violations
      .map((v) => `item ${v.itemIndex + 1} (max ${v.allowedPct}%)`)
      .join(", ");
    return `Reduce the discount before finalizing: ${detail}`;
  }

  return null;
}
