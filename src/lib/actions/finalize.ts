"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin, requireSession } from "@/lib/authz";
import { documentWhereForUser } from "@/lib/scope";
import { idSchema } from "@/lib/validation/documents";
import { validateFinalizable, type FinalizableDocument } from "@/lib/validation/finalize";
import { recalcDocument } from "@/lib/actions/documents";
import { allocateNumber, formatDocNumber } from "@/lib/numbering";

const NOT_FOUND_ERROR = "Not found";

/** Fallback used when no `Setting` row exists for "quote.validityDays" (or
 * its value isn't a finite number) — quotes are valid for a week by
 * default. */
const DEFAULT_QUOTE_VALIDITY_DAYS = 7;
const QUOTE_VALIDITY_SETTING_KEY = "quote.validityDays";

export type FinalizeResult = { ok: true; number: string } | { error: string };
export type UnfinalizeResult = { ok: true } | { error: string };

// Re-exported so callers of this action module (and its own tests) can reach
// the pure eligibility check without a second import — the implementation
// lives in src/lib/validation/finalize.ts purely so it can be unit tested
// without pulling in `@/lib/db` (see that file's header comment).
export { validateFinalizable, type FinalizableDocument };

// --- finalize ----------------------------------------------------------------

/**
 * Turns a DRAFT into a numbered, immutable-going-forward FINAL document:
 * recalculates totals (and, crucially, checks the violations that comes
 * back — see the NOTE on `recalcDocument`), validates the document is
 * actually finalizable, then atomically allocates a display number (or
 * reuses the existing one, for a document that was previously finalized and
 * then unfinalized — see `unfinalizeDocument`) and freezes an
 * `entitySnapshot` from the document's region so a FINAL document's
 * rendering never has to query `Region` again (a later admin edit to the
 * region's bank details/logo/etc. must never retroactively change an
 * already-issued document).
 */
export async function finalizeDocument(documentId: string): Promise<FinalizeResult> {
  const session = await requireSession();

  const parsedId = idSchema.safeParse(documentId);
  if (!parsedId.success) return { error: NOT_FOUND_ERROR };

  const document = await db.document.findFirst({
    where: { id: parsedId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
    include: {
      items: {
        include: {
          lines: true,
          product: { include: { series: true } },
        },
      },
      lines: { where: { itemId: null } },
      company: true,
      contact: true,
      region: true,
    },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  // Recompute totals first (a discount cap may have been lowered since this
  // was last saved) and check the violations it reports before allowing the
  // document to become FINAL.
  const violations = await recalcDocument(document.id);

  const validationError = validateFinalizable(
    { companyId: document.companyId, items: document.items, lines: document.lines },
    violations
  );
  if (validationError) return { error: validationError };

  // Only quotes carry a validity window; read the org-wide default once
  // (fallback applies both when the Setting row is missing and when its
  // value isn't a finite number).
  let validityDays: number | null = null;
  if (document.type === "QUOTE") {
    const setting = await db.setting.findUnique({ where: { key: QUOTE_VALIDITY_SETTING_KEY } });
    const rawValue = setting?.value;
    validityDays =
      typeof rawValue === "number" && Number.isFinite(rawValue)
        ? rawValue
        : DEFAULT_QUOTE_VALIDITY_DAYS;
  }

  const entitySnapshot = {
    entityName: document.region.entityName,
    entityLegalId: document.region.entityLegalId,
    entityAddress: document.region.entityAddress,
    bankDetails: document.region.bankDetails,
    logoUrl: document.region.logoUrl,
    footerText: document.region.footerText,
    regionCode: document.region.code,
    currency: document.currency,
    taxName: document.taxName,
    taxRate: document.taxRate.toString(),
  };

  // Number allocation and the FINAL update happen inside one interactive
  // transaction: if the update ever fails (e.g. an extremely unlikely
  // `number` unique-constraint collision, or the concurrent-finalize guard
  // below tripping), the whole transaction — counter increment included —
  // rolls back rather than leaving an allocated counter value that was
  // never actually assigned to a document. The allocation must stay ordered
  // *before* the guarded update (both still inside this same interactive
  // txn): if the update's status guard fails and throws, the txn rolls back
  // and undoes the counter increment along with it, so a lost race never
  // burns a number.
  let number: string;
  try {
    number = await db.$transaction(async (tx) => {
      // Re-finalizing a document that was unfinalized keeps its original
      // number (unfinalizeDocument never clears it) instead of burning a new
      // counter value.
      let resolvedNumber = document.number;
      if (!resolvedNumber) {
        // Year is derived from the server's current date (Australia/Melbourne
        // TZ isn't threaded through explicitly — `new Date().getFullYear()` is
        // accepted per plan; revisit if this ever runs in a non-AU-local
        // deployment near a year boundary).
        const year = new Date().getFullYear();
        const counter = await allocateNumber(tx, document.region.code, document.type, year);
        resolvedNumber = formatDocNumber(document.type, document.region.code, year, counter);
      }

      // Guard against a concurrent finalize (e.g. a double-click, or two
      // requests racing) with a status-scoped `updateMany` instead of an
      // unconditional `update`: if another request already flipped this
      // document to FINAL between our `findFirst` above and here, `count`
      // comes back 0 and we throw to roll back the whole transaction —
      // including the number allocation above.
      const res = await tx.document.updateMany({
        where: { id: document.id, status: "DRAFT" },
        data: {
          status: "FINAL",
          number: resolvedNumber,
          issueDate: new Date(),
          validityDays,
          entitySnapshot: entitySnapshot as Prisma.InputJsonValue,
        },
      });
      if (res.count !== 1) throw new Error("ALREADY_FINALIZED");

      return resolvedNumber;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_FINALIZED") {
      return { error: "Document was already finalized" };
    }
    throw err;
  }

  revalidatePath("/documents");
  revalidatePath(`/documents/${document.id}`);

  return { ok: true, number };
}

// --- unfinalize (admin escape hatch) -----------------------------------------

/**
 * ADMIN-only escape hatch for a FINAL document issued in error: flips it
 * back to DRAFT so it becomes editable again, but deliberately keeps
 * `number` and `entitySnapshot` set — re-finalizing (see above) reuses the
 * existing number rather than allocating a new one, so a document can never
 * accumulate more than one number across an unfinalize/finalize cycle.
 */
export async function unfinalizeDocument(documentId: string): Promise<UnfinalizeResult> {
  const session = await requireAdmin();

  const parsedId = idSchema.safeParse(documentId);
  if (!parsedId.success) return { error: NOT_FOUND_ERROR };

  const document = await db.document.findFirst({
    where: { id: parsedId.data, status: "FINAL", ...documentWhereForUser(session.user) },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  await db.document.update({
    where: { id: document.id },
    data: { status: "DRAFT" },
  });

  revalidatePath("/documents");
  revalidatePath(`/documents/${document.id}`);

  return { ok: true };
}
