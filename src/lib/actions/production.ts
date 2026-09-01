"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/authz";
import { documentWhereForUser } from "@/lib/scope";
import { idSchema } from "@/lib/validation/documents";
import { specSchemaForCode } from "@/lib/production-forms/resolve";

export type ActionResult = { error?: string };

export type SetProductionSpecResult = ActionResult & {
  /**
   * Names of sibling items (same `lineGroup`) whose `ui` this call also
   * changed -- present only when at least one sibling's screen side actually
   * flipped, so the editor can toast exactly what else moved. See
   * `setProductionSpec`'s doc comment for why the write itself is
   * unconditional.
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
 * `ui` is written to every item in the same `lineGroup`: a cutter and its
 * spreaders stand together and a mismatched operator-screen side is a
 * physical installation fault, not a cosmetic one.
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
    });

    for (const sibling of siblings) {
      const current = (sibling.productionSpec ?? {}) as Record<string, unknown>;
      if (current.ui === ui) continue;
      await tx.documentItem.update({
        where: { id: sibling.id },
        data: { productionSpec: { ...current, ui } },
      });
      propagatedTo.push(`${sibling.name} (${sibling.code})`);
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
