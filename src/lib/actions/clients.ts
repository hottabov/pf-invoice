"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/authz";
import { companyWhereForUser } from "@/lib/scope";
import { companySchema, contactSchema } from "@/lib/validation/clients";
import { idSchema } from "@/lib/validation/documents";

export type ActionResult = { error?: string };

// --- shared helpers ----------------------------------------------------

/** Join every zod issue message (form-level + field-level) into one string
 * for a plain `{ error }` result — see src/lib/actions/catalog.ts for the
 * same helper on the catalog editors. */
function flattenZodError(error: z.ZodError): string {
  const flat = error.flatten();
  const messages = [...flat.formErrors, ...Object.values(flat.fieldErrors).flat()].filter(
    (m): m is string => Boolean(m)
  );
  return messages.length > 0 ? messages.join(" ") : "Invalid input";
}

const NOT_FOUND_ERROR = "Not found";

function readCompanyForm(formData: FormData) {
  return {
    name: formData.get("name"),
    street: formData.get("street"),
    city: formData.get("city"),
    state: formData.get("state"),
    postcode: formData.get("postcode"),
    country: formData.get("country"),
    taxId: formData.get("taxId"),
    notes: formData.get("notes"),
    regionCode: formData.get("regionCode"),
  };
}

function readContactForm(formData: FormData) {
  return {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    position: formData.get("position"),
    isPrimary: formData.get("isPrimary"),
  };
}

// --- companies -----------------------------------------------------------

/**
 * Creates a company owned by the current session's user — managers create
 * their own clients; an admin who creates one also becomes its owner (they
 * can see and edit every company regardless, via companyWhereForUser).
 */
export async function createCompany(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsed = companySchema.safeParse(readCompanyForm(formData));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const region = await db.region.findUnique({ where: { code: parsed.data.regionCode } });
  if (!region) return { error: "Region not found" };

  const created = await db.company.create({
    data: {
      name: parsed.data.name,
      street: parsed.data.street ?? null,
      city: parsed.data.city ?? null,
      state: parsed.data.state ?? null,
      postcode: parsed.data.postcode ?? null,
      country: parsed.data.country ?? null,
      taxId: parsed.data.taxId ?? null,
      notes: parsed.data.notes ?? null,
      regionId: region.id,
      ownerId: session.user.id,
    },
  });

  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
}

export async function updateCompany(companyId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const idParsed = idSchema.safeParse(companyId);
  if (!idParsed.success) {
    return { error: NOT_FOUND_ERROR };
  }

  const parsed = companySchema.safeParse(readCompanyForm(formData));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const existing = await db.company.findFirst({
    where: { id: companyId, ...companyWhereForUser(session.user) },
  });
  if (!existing) return { error: NOT_FOUND_ERROR };

  const region = await db.region.findUnique({ where: { code: parsed.data.regionCode } });
  if (!region) return { error: "Region not found" };

  await db.company.update({
    where: { id: companyId },
    data: {
      name: parsed.data.name,
      street: parsed.data.street ?? null,
      city: parsed.data.city ?? null,
      state: parsed.data.state ?? null,
      postcode: parsed.data.postcode ?? null,
      country: parsed.data.country ?? null,
      taxId: parsed.data.taxId ?? null,
      notes: parsed.data.notes ?? null,
      regionId: region.id,
    },
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${companyId}`);
  return {};
}

export async function deleteCompany(companyId: string): Promise<ActionResult> {
  const session = await requireSession();

  const idParsed = idSchema.safeParse(companyId);
  if (!idParsed.success) {
    return { error: NOT_FOUND_ERROR };
  }

  const existing = await db.company.findFirst({
    where: { id: companyId, ...companyWhereForUser(session.user) },
  });
  if (!existing) return { error: NOT_FOUND_ERROR };

  const documentCount = await db.document.count({ where: { companyId } });
  if (documentCount > 0) {
    return { error: "This company has quotes or invoices and can't be deleted." };
  }

  // Contact rows cascade (Contact.companyId is onDelete: Cascade in the schema).
  await db.company.delete({ where: { id: companyId } });

  revalidatePath("/clients");
  redirect("/clients");
}

// --- contacts --------------------------------------------------------------

/**
 * Creates a contact under `companyId`, scope-checked through the parent
 * company. Marking it primary clears every other contact's primary flag on
 * the same company in one transaction, so at most one contact per company
 * is ever primary.
 */
export async function createContact(companyId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const idParsed = idSchema.safeParse(companyId);
  if (!idParsed.success) {
    return { error: NOT_FOUND_ERROR };
  }

  const company = await db.company.findFirst({
    where: { id: companyId, ...companyWhereForUser(session.user) },
  });
  if (!company) return { error: NOT_FOUND_ERROR };

  const parsed = contactSchema.safeParse(readContactForm(formData));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  await db.$transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx.contact.updateMany({
        where: { companyId: company.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    await tx.contact.create({
      data: {
        companyId: company.id,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        position: parsed.data.position ?? null,
        isPrimary: parsed.data.isPrimary,
      },
    });
  });

  revalidatePath(`/clients/${company.id}`);
  return {};
}

export async function updateContact(contactId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const idParsed = idSchema.safeParse(contactId);
  if (!idParsed.success) {
    return { error: NOT_FOUND_ERROR };
  }

  const existing = await db.contact.findFirst({
    where: { id: contactId, company: companyWhereForUser(session.user) },
  });
  if (!existing) return { error: NOT_FOUND_ERROR };

  const parsed = contactSchema.safeParse(readContactForm(formData));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  await db.$transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx.contact.updateMany({
        where: { companyId: existing.companyId, id: { not: contactId }, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    await tx.contact.update({
      where: { id: contactId },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        position: parsed.data.position ?? null,
        isPrimary: parsed.data.isPrimary,
      },
    });
  });

  revalidatePath(`/clients/${existing.companyId}`);
  return {};
}

export async function deleteContact(contactId: string): Promise<ActionResult> {
  const session = await requireSession();

  const idParsed = idSchema.safeParse(contactId);
  if (!idParsed.success) {
    return { error: NOT_FOUND_ERROR };
  }

  const existing = await db.contact.findFirst({
    where: { id: contactId, company: companyWhereForUser(session.user) },
  });
  if (!existing) return { error: NOT_FOUND_ERROR };

  await db.contact.delete({ where: { id: contactId } });

  revalidatePath(`/clients/${existing.companyId}`);
  return {};
}
