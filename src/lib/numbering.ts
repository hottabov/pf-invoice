// Pure(ish) helpers for document numbering. `formatDocNumber` is fully pure
// and unit-tested directly (tests/numbering.test.ts). `allocateNumber` takes
// its transaction client as a parameter rather than importing `@/lib/db`
// itself — the caller (finalizeDocument, src/lib/actions/finalize.ts) is
// responsible for running it inside a Prisma interactive transaction, which
// is what makes the allocation race-safe.
import type { Prisma } from "@prisma/client";

const QUOTE_PREFIX = "Q";

/**
 * Formats a document's display number, e.g.
 * `formatDocNumber("AU", 2026, 1)` -> `"Q-AU-2026-001"`.
 * The counter is zero-padded to 3 digits but is never truncated — once a
 * region/year sequence passes 999, the number simply grows wider
 * (`formatDocNumber("AU", 2026, 1000)` -> `"Q-AU-2026-1000"`).
 */
export function formatDocNumber(regionCode: string, year: number, counter: number): string {
  return `${QUOTE_PREFIX}-${regionCode}-${year}-${String(counter).padStart(3, "0")}`;
}

/** The subset of a Prisma (interactive-transaction) client this needs —
 * just the `numberSequence` delegate — so it can be called with either the
 * real `tx` handed to a `db.$transaction(async (tx) => ...)` callback, or a
 * lightweight test double. */
type NumberSequenceTx = {
  numberSequence: Prisma.TransactionClient["numberSequence"];
};

/**
 * Atomically allocates and returns the next counter for (regionCode, year)
 * via `NumberSequence` (`@@unique([regionCode, year])` in schema.prisma).
 * MUST be called inside a Prisma interactive transaction — the upsert
 * compiles to a single `INSERT ... ON CONFLICT (regionCode, year) DO UPDATE
 * SET counter = counter + 1` statement, so Postgres itself serializes
 * concurrent finalize calls for the same sequence (no JS-side
 * read-modify-write race, even under concurrent transactions targeting the
 * same row).
 */
export async function allocateNumber(
  tx: NumberSequenceTx,
  regionCode: string,
  year: number
): Promise<number> {
  const row = await tx.numberSequence.upsert({
    where: { regionCode_year: { regionCode, year } },
    create: { regionCode, year, counter: 1 },
    update: { counter: { increment: 1 } },
    select: { counter: true },
  });
  return row.counter;
}
