"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import type { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { idSchema } from "@/lib/validation/documents";
import {
  createUserSchema,
  updateUserSchema,
  setUserPasswordSchema,
  canModifyUser,
} from "@/lib/validation/users";
import { countActiveAdmins } from "@/lib/queries/users";

export type ActionResult = { error?: string };

const NOT_FOUND_ERROR = "Not found";
const EMAIL_EXISTS_ERROR = "That email already exists — choose a different one.";

/** Join every zod issue message (form-level + field-level) into one string
 * for a plain `{ error }` result — see src/lib/actions/content.ts for the
 * same helper on the content-block editor. */
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

function readCreateUserForm(formData: FormData) {
  return {
    email: formData.get("email"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    role: formData.get("role"),
    regionCode: formData.get("regionCode"),
    password: formData.get("password"),
  };
}

function readUpdateUserForm(formData: FormData) {
  return {
    name: formData.get("name"),
    phone: formData.get("phone"),
    role: formData.get("role"),
    regionCode: formData.get("regionCode"),
    active: formData.get("active"),
  };
}

/** Resolves a region code to its id, or `null` for "no region assigned".
 * Returns `{ error }` if a non-null code doesn't match an existing region —
 * mirrors `resolveRegionId` in src/lib/actions/content.ts. */
async function resolveRegionId(
  regionCode: string | null
): Promise<{ error: string } | { regionId: string | null }> {
  if (regionCode === null) return { regionId: null };
  const region = await db.region.findUnique({ where: { code: regionCode } });
  if (!region) return { error: "Region not found" };
  return { regionId: region.id };
}

function revalidateUserPaths(userId: string) {
  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${userId}`);
}

/**
 * Creates a new user, active by default. Leaving `password` empty (the
 * form's default) creates a magic-link-only account — no `passwordHash` is
 * ever written for an empty/missing password, matching how `auth.ts`'s
 * Credentials provider treats a null `passwordHash` as "this account can't
 * use the password form."
 */
export async function createUser(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = createUserSchema.safeParse(readCreateUserForm(formData));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const resolved = await resolveRegionId(parsed.data.regionCode);
  if ("error" in resolved) return { error: resolved.error };

  const passwordHash = parsed.data.password ? await hash(parsed.data.password) : undefined;

  let created;
  try {
    created = await db.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name ?? null,
        phone: parsed.data.phone ?? null,
        role: parsed.data.role,
        regionId: resolved.regionId,
        passwordHash,
        active: true,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: EMAIL_EXISTS_ERROR };
    throw error;
  }

  revalidatePath("/settings/users");
  redirect(`/settings/users/${created.id}`);
}

/**
 * Updates a user's name/role/region and active flag. Guarded by
 * `canModifyUser` so an admin can neither lock themselves out (deactivating
 * or demoting their own account) nor strand the system with zero active
 * admins — see src/lib/validation/users.ts for the full rationale. Email and
 * password are never touched here (see `setUserPassword` for the latter).
 */
export async function updateUser(userId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();

  const idParsed = idSchema.safeParse(userId);
  if (!idParsed.success) return { error: NOT_FOUND_ERROR };

  const parsed = updateUserSchema.safeParse(readUpdateUserForm(formData));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { error: NOT_FOUND_ERROR };

  const activeAdminCount = await countActiveAdmins();
  const blockedReason = canModifyUser(
    session.user.id,
    { id: target.id, role: target.role, active: target.active },
    { role: parsed.data.role, active: parsed.data.active },
    activeAdminCount
  );
  if (blockedReason) return { error: blockedReason };

  const resolved = await resolveRegionId(parsed.data.regionCode);
  if ("error" in resolved) return { error: resolved.error };

  await db.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name ?? null,
      phone: parsed.data.phone ?? null,
      role: parsed.data.role,
      regionId: resolved.regionId,
      active: parsed.data.active,
    },
  });

  revalidateUserPaths(userId);
  return {};
}

/**
 * Replaces a user's password hash outright — used both to set an initial
 * password for a magic-link-only account and to rotate an existing one.
 * Always requires a real (≥10 char) password; there's no "leave blank to
 * keep the current one" case here, unlike `updateUser`'s other fields —
 * the form only submits this action when the admin actually typed a new
 * password (see SetPasswordForm).
 */
export async function setUserPassword(userId: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const idParsed = idSchema.safeParse(userId);
  if (!idParsed.success) return { error: NOT_FOUND_ERROR };

  const parsed = setUserPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { error: NOT_FOUND_ERROR };

  const passwordHash = await hash(parsed.data.password);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });

  revalidateUserPaths(userId);
  return {};
}
