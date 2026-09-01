// Pure finalize-eligibility check, split out of src/lib/actions/finalize.ts
// for the same reason src/lib/validation/documents.ts is split out of
// src/lib/actions/documents.ts: this file must have zero `@/lib/db` or
// `next/*` imports (importing `@/lib/db` eagerly constructs a Prisma client
// against `DATABASE_URL`, which isn't set — and shouldn't need to be — for
// a plain `vitest run` of pure logic; see tests/finalize-validation.test.ts).
// `EngineViolation` is a plain type from the dependency-free pricing engine
// (src/lib/pricing.ts); `reconcileEasyLoaderSections` walks the same
// db-free chain (resolve.ts -> specs/* -> validation/production-spec.ts),
// so pulling it in here doesn't compromise that either.
import type { EngineViolation } from "../pricing";
import { reconcileEasyLoaderSections } from "../production-forms/resolve";

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

/** The two roles that can ever call `finalizeDocument` — kept as a local
 * string-literal union rather than importing Prisma's generated `Role` enum,
 * for the same "no `@/lib/db`-adjacent import" reason as everything else in
 * this file (the enum itself has no runtime/env dependency, but there's no
 * need to couple this pure module to `@prisma/client` either). */
export type FinalizerRole = "ADMIN" | "MANAGER";

/**
 * Returns a human-readable reason the document can't be finalized, or
 * `null` when it's ready. Checked in this order so a caller only ever sees
 * one actionable message at a time:
 *   1. no client selected yet;
 *   2. nothing to bill — zero items AND zero document-level lines;
 *   3. the pricing engine flagged a discount above its region cap (an item
 *      discount can end up violating its cap after the fact if an admin
 *      lowers `Region.maxDiscountPct` later — see the NOTE on
 *      `recalcDocument` in src/lib/actions/documents.ts — so this must be
 *      re-checked at finalize time, not just at save time) — but ONLY for a
 *      MANAGER. An ADMIN may finalize over a discount-cap violation (they
 *      can already set an over-cap item discount in the first place — see
 *      `setItemDiscount` — so blocking them again at finalize time would
 *      just be a second copy of a rule that's already role-gated upstream);
 *      the caller (`finalizeDocument`) is responsible for logging that an
 *      admin overrode a violation.
 */
export function validateFinalizable(
  doc: FinalizableDocument,
  violations: EngineViolation[],
  role: FinalizerRole
): string | null {
  if (!doc.companyId) {
    return "Select a client before finalizing";
  }

  const hasDocumentLevelLines = doc.lines.some((line) => line.itemId === null);
  if (doc.items.length === 0 && !hasDocumentLevelLines) {
    return "Add at least one item or line before finalizing";
  }

  if (violations.length > 0 && role !== "ADMIN") {
    const detail = violations
      .map((v) => `item ${v.itemIndex + 1} (max ${v.allowedPct}%)`)
      .join(", ");
    return `Reduce the discount before finalizing: ${detail}`;
  }

  return null;
}

/** The minimal shape `validateEasyLoaderSections` needs from a document's
 * item and its lines -- deliberately not typed against Prisma's generated
 * `DocumentItem`/`DocumentLine` payload, for the same "trivial to unit test
 * with hand-built fixtures, no `@/lib/db`" reason as `FinalizableDocument`
 * above. `kind` is a plain string rather than the generated `LineKind` enum
 * for that same reason. */
export type FinalizableItem = {
  code: string;
  productionSpec: unknown;
  lines: { kind: string; code: string | null; qty: number }[];
};

/**
 * Refuses to finalize when any EasyLoader item's table sections disagree
 * with what was actually sold -- see table-sections.ts's header comment for
 * why the two must never drift apart, and reconcileEasyLoaderSections for
 * where the check itself lives (shared with the production-forms route and
 * the builder's panel, so all three can never disagree).
 *
 * Unlike the discount-cap check in `validateFinalizable` above, this has
 * **no ADMIN override**, and deliberately so: a discount cap is a
 * commercial judgement a senior person may legitimately overrule (they can
 * already set an over-cap discount in the first place -- see
 * `validateFinalizable`'s header comment). A table-section layout that
 * disagrees with what was sold is not a judgement call to overrule; it
 * describes a table that cannot physically be built as drawn. Finalizing it
 * anyway sends the workshop scrap metal, not a typo, so every role is
 * blocked the same way.
 */
export function validateEasyLoaderSections(items: FinalizableItem[]): string | null {
  for (const item of items) {
    const optionQtys = item.lines
      .filter((line): line is typeof line & { code: string } => line.kind === "OPTION" && Boolean(line.code))
      .map((line) => ({ code: line.code, qty: line.qty }));

    const reconciliation = reconcileEasyLoaderSections(item.code, item.productionSpec, optionQtys);
    if (reconciliation && !reconciliation.ok) {
      return `Fix the table sections on ${item.code} before finalizing: ${reconciliation.problems.join("; ")}`;
    }
  }

  return null;
}
