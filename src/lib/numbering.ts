// Pure(ish) helpers for document numbering. `formatDocNumber` is fully pure
// and unit-tested directly (tests/numbering.test.ts). `allocateNumber` takes
// its transaction client as a parameter rather than importing `@/lib/db`
// itself — the caller (finalizeDocument, src/lib/actions/finalize.ts) is
// responsible for running it inside a Prisma interactive transaction, which
// is what makes the allocation race-safe.
import type { DocumentType, Prisma } from "@prisma/client";

const NUMBER_PREFIX: Record<DocumentType, string> = {
  QUOTE: "Q",
  INVOICE: "INV",
};

/**
 * Formats a document's display number, e.g.
 * `formatDocNumber("QUOTE", "AU", 2026, 1)` -> `"Q-AU-2026-001"` and
 * `formatDocNumber("INVOICE", "AU", 2026, 1)` -> `"INV-AU-2026-001"`.
 * The counter is zero-padded to 3 digits but is never truncated — once a
 * region/type/year sequence passes 999, the number simply grows wider
 * (`formatDocNumber("QUOTE", "AU", 2026, 1000)` -> `"Q-AU-2026-1000"`).
 */
export function formatDocNumber(
  type: DocumentType,
  regionCode: string,
  year: number,
  counter: number
): string {
  const padded = String(counter).padStart(3, "0");
  return `${NUMBER_PREFIX[type]}-${regionCode}-${year}-${padded}`;
}

/** The subset of a Prisma (interactive-transaction) client this needs —
 * just the `numberSequence` delegate — so it can be called with either the
 * real `tx` handed to a `db.$transaction(async (tx) => ...)` callback, or a
 * lightweight test double. */
type NumberSequenceTx = {
  numberSequence: Prisma.TransactionClient["numberSequence"];
};

/**
 * Atomically allocates and returns the next counter for
 * (regionCode, docType, year) via `NumberSequence`
 * (`@@unique([regionCode, docType, year])` in schema.prisma). MUST be called
 * inside a Prisma interactive transaction — the upsert compiles to a single
 * `INSERT ... ON CONFLICT (regionCode, docType, year) DO UPDATE SET counter
 * = counter + 1` statement, so Postgres itself serializes concurrent
 * finalize calls for the same sequence (no JS-side read-modify-write race,
 * even under concurrent transactions targeting the same row).
 */
export async function allocateNumber(
  tx: NumberSequenceTx,
  regionCode: string,
  docType: DocumentType,
  year: number
): Promise<number> {
  const sequence = await tx.numberSequence.upsert({
    where: { regionCode_docType_year: { regionCode, docType, year } },
    create: { regionCode, docType, year, counter: 1 },
    update: { counter: { increment: 1 } },
  });
  return sequence.counter;
}
