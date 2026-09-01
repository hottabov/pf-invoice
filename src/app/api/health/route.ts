import { db } from "@/lib/db";

// Never prerendered/cached — this must hit the database on every request.
export const dynamic = "force-dynamic";

export async function GET() {
  let ok = false;
  try {
    await db.$queryRaw`SELECT 1`;
    ok = true;
  } catch {
    return Response.json({ ok: false, db: false, schemaOk: false }, { status: 503 });
  }

  // Connectivity alone isn't enough: a deploy that starts the app before
  // migrations finish (or where migrations silently fail) still passes
  // `SELECT 1` against a stale schema — that's exactly how the 2026-08-31
  // incident (missing User.phone / Document.showItemPrices /
  // Region.maxDiscountPct columns) went unnoticed until every login failed.
  // Probe columns from the newest migrations directly. Kept cheap
  // (findFirst, no counts/joins) since this runs on every deploy's health
  // check plus any monitoring that polls this route.
  let schemaOk = true;
  let error: string | undefined;
  try {
    await db.user.findFirst({ select: { id: true, phone: true } });
    await db.document.findFirst({
      select: {
        id: true,
        showItemPrices: true,
        validityDays: true,
        discountMode: true,
        discountValue: true,
      },
    });
    await db.documentItem.findFirst({
      select: { id: true, productionSpec: true, lineGroup: true, discountMode: true, discountValue: true },
    });
    await db.documentLine.findFirst({ select: { id: true, imageUrl: true } });
    await db.company.findFirst({ select: { id: true, industryId: true } });
    await db.region.findFirst({ select: { id: true, maxDiscountPct: true } });
  } catch (e) {
    schemaOk = false;
    error = e instanceof Error ? e.message : String(e);
  }

  return Response.json(
    { ok, db: ok, schemaOk, ...(error ? { error } : {}) },
    { status: schemaOk ? 200 : 503 }
  );
}
