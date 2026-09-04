"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/authz";
import { documentWhereForUser } from "@/lib/scope";
import { idSchema } from "@/lib/validation/documents";
import { resolveForm, specSchemaForCode } from "@/lib/production-forms/resolve";

export type ActionResult = { error?: string };

export type SetProductionSpecResult = ActionResult & {
  /**
   * Product codes of the sibling items (same `lineGroup`) whose `ui` this
   * call also changed -- present only when at least one sibling's screen
   * side actually flipped, so the editor can toast exactly what else moved.
   *
   * Codes, not names. A product name here can be the better part of a
   * paragraph (the software modules carry their whole feature list as a
   * name), and the toast that prints this is one line.
   */
  propagatedTo?: string[];
};

const NOT_FOUND_ERROR = "Not found";

/** Join every zod issue message (form-level + field-level) into one string
 * for a plain `{ error }` result -- same helper as every other action
 * module (each keeps a private copy: a `"use server"` module may only
 * export async server actions, so this can't be shared via a named
 * export). */
function flattenZodError(error: z.ZodError): string {
  const flat = error.flatten();
  const messages = [...flat.formErrors, ...Object.values(flat.fieldErrors).flat()].filter(
    (m): m is string => Boolean(m)
  );
  return messages.length > 0 ? messages.join(" ") : "Invalid input";
}

/**
 * Writes an item's production spec.
 *
 * Deliberately NOT gated on `status: "DRAFT"`, unlike every other item
 * mutation in src/lib/actions/documents.ts. The production spec carries no
 * commercial meaning -- it does not touch price, tax or totals -- so
 * requiring an unfinalize/refinalize cycle to correct a knife size would
 * churn document numbering for no gain. See spec section 4.1.
 *
 * `ui` is written to every *machine* in the same `lineGroup`: a cutter and
 * its spreaders stand together and a mismatched operator-screen side is a
 * physical installation fault, not a cosmetic one.
 *
 * "Machine" here means an item `resolveForm` recognises. A screen side is a
 * fact about a thing an operator stands in front of, and the line also holds
 * software modules, service entries and accessories, which have no side and
 * no form to print one on. They used to be written to anyway -- invisible in
 * the builder, since those cards render no spec panel at all, but the toast
 * named them, which is how this was noticed. Gating on the form rather than
 * on a hand-kept list of series codes means the set widens on its own the day
 * the X, L and EF forms are written.
 */
export async function setProductionSpec(itemId: string, spec: unknown): Promise<SetProductionSpecResult> {
  const session = await requireSession();

  const parsedItemId = idSchema.safeParse(itemId);
  if (!parsedItemId.success) return { error: NOT_FOUND_ERROR };

  const item = await db.documentItem.findFirst({
    where: { id: parsedItemId.data, document: documentWhereForUser(session.user) },
  });
  if (!item) return { error: NOT_FOUND_ERROR };

  const schema = specSchemaForCode(item.code);
  if (!schema) return { error: "This item has no production form" };

  const parsed = schema.safeParse(spec);
  if (!parsed.success) return { error: flattenZodError(parsed.error) };

  const ui = (parsed.data as { ui?: string }).ui;
  const propagatedTo: string[] = [];

  await db.$transaction(async (tx) => {
    await tx.documentItem.update({
      where: { id: item.id },
      data: { productionSpec: parsed.data as object },
    });

    if (!ui) return;

    const siblings = await tx.documentItem.findMany({
      where: { documentId: item.documentId, lineGroup: item.lineGroup, id: { not: item.id } },
      select: { id: true, code: true, productionSpec: true },
    });

    for (const sibling of siblings) {
      if (!resolveForm(sibling.code)) continue;
      const current = (sibling.productionSpec ?? {}) as Record<string, unknown>;
      if (current.ui === ui) continue;
      await tx.documentItem.update({
        where: { id: sibling.id },
        data: { productionSpec: { ...current, ui } },
      });
      propagatedTo.push(sibling.code);
    }
  });

  revalidatePath(`/documents/${item.documentId}`);
  return propagatedTo.length > 0 ? { propagatedTo } : {};
}

/**
 * Moves an item to a production line. Lines are plain integers (spec 4.2);
 * 1-9 is far beyond any real quote and keeps the chip a fixed size.
 */
export async function setItemLineGroup(itemId: string, lineGroup: number): Promise<ActionResult> {
  const session = await requireSession();

  const parsedItemId = idSchema.safeParse(itemId);
  if (!parsedItemId.success) return { error: NOT_FOUND_ERROR };

  if (!Number.isInteger(lineGroup) || lineGroup < 1 || lineGroup > 9) {
    return { error: "Line must be between 1 and 9" };
  }

  const item = await db.documentItem.findFirst({
    where: { id: parsedItemId.data, document: documentWhereForUser(session.user) },
  });
  if (!item) return { error: NOT_FOUND_ERROR };

  await db.documentItem.update({ where: { id: item.id }, data: { lineGroup } });

  revalidatePath(`/documents/${item.documentId}`);
  return {};
}
