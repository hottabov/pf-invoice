"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/authz";
import { idSchema, optionalIdSchema } from "@/lib/validation/documents";
import { industryNameSchema, normalizeIndustryName } from "@/lib/validation/industries";
import { companyWhereForUser } from "@/lib/scope";

export type ActionResult = { error?: string };

const NOT_FOUND_ERROR = "Not found";

/** Join every zod issue message (form-level + field-level) into one string
 * for a plain `{ error }` result — mirrors src/lib/actions/clients.ts and
 * every other action module (each keeps a private copy: a `"use server"`
 * module may only export async server actions, so this can't be shared via
 * a named export). */
function flattenZodError(error: z.ZodError): string {
  const flat = error.flatten();
  const messages = [...flat.formErrors, ...Object.values(flat.fieldErrors).flat()].filter(
    (m): m is string => Boolean(m)
  );
  return messages.length > 0 ? messages.join(" ") : "Invalid input";
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Creates an industry, or returns the existing one when a case-insensitive
 * match is already present -- typing "automotive" next to an existing
 * "Automotive" must not grow the list by a near-duplicate.
 */
export async function createIndustry(name: string): Promise<ActionResult & { id?: string }> {
  await requireSession();

  const parsed = industryNameSchema.safeParse(name);
  if (!parsed.success) return { error: flattenZodError(parsed.error) };

  const key = normalizeIndustryName(parsed.data);
  const existing = (await db.industry.findMany()).find(
    (row) => normalizeIndustryName(row.name) === key,
  );
  if (existing) return { id: existing.id };

  try {
    const created = await db.industry.create({ data: { name: parsed.data } });
    revalidatePath("/clients");
    return { id: created.id };
  } catch (error) {
    // The findMany() check above is check-then-act and can race: two
    // concurrent creates for the same normalized name can both pass it.
    // The database's case-insensitive functional unique index
    // (Industry_name_lower_key, added in Task 1) is what actually
    // guarantees uniqueness. Losing that race is expected, not an error --
    // re-resolve to the row that won and hand back its id, exactly as if
    // the initial check had found it.
    if (isUniqueConstraintError(error)) {
      const winner = (await db.industry.findMany()).find(
        (row) => normalizeIndustryName(row.name) === key,
      );
      if (winner) return { id: winner.id };
    }
    throw error;
  }
}

/**
 * Renames the shared row. The caller shows the affected-company count first
 * (see `countCompaniesUsingIndustry`); this only guards the data.
 */
export async function renameIndustry(industryId: string, name: string): Promise<ActionResult> {
  await requireSession();

  const parsedId = idSchema.safeParse(industryId);
  if (!parsedId.success) return { error: NOT_FOUND_ERROR };

  const parsed = industryNameSchema.safeParse(name);
  if (!parsed.success) return { error: flattenZodError(parsed.error) };

  const industry = await db.industry.findUnique({ where: { id: parsedId.data } });
  if (!industry) return { error: NOT_FOUND_ERROR };

  const key = normalizeIndustryName(parsed.data);
  const clash = (await db.industry.findMany()).find(
    (row) => row.id !== industry.id && normalizeIndustryName(row.name) === key,
  );
  if (clash) return { error: `"${clash.name}" already exists` };

  await db.industry.update({ where: { id: industry.id }, data: { name: parsed.data } });

  revalidatePath("/clients");
  return {};
}

/**
 * Points a company at an industry, or clears it. Scoped like every other
 * company mutation in src/lib/actions/clients.ts.
 */
export async function setCompanyIndustry(
  companyId: string,
  industryId: string | null,
): Promise<ActionResult> {
  const session = await requireSession();

  const parsedCompanyId = idSchema.safeParse(companyId);
  if (!parsedCompanyId.success) return { error: NOT_FOUND_ERROR };

  const parsedIndustryId = optionalIdSchema.safeParse(industryId ?? undefined);
  if (!parsedIndustryId.success) return { error: NOT_FOUND_ERROR };

  const company = await db.company.findFirst({
    where: { id: parsedCompanyId.data, ...companyWhereForUser(session.user) },
  });
  if (!company) return { error: NOT_FOUND_ERROR };

  await db.company.update({
    where: { id: company.id },
    data: { industryId: parsedIndustryId.data ?? null },
  });

  revalidatePath(`/clients/${company.id}`);
  return {};
}
