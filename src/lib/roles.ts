// Single source of truth for "is this an admin?" across the app.
//
// DEVELOPER carries the exact same rights as ADMIN everywhere (see the Role
// enum's own comment in schema.prisma) -- what makes it distinct is only
// that the support form addresses its message to whoever holds it (see
// src/lib/actions/support.ts). Every place that used to compare a role
// against the literal "ADMIN" now calls this instead, so the next role that
// should carry admin rights is one line here, not a fresh grep across the
// whole tree.
//
// Deliberately typed against a bare `string` rather than Prisma's generated
// `Role` (or a local role-union type): callers pass this a session's Role
// enum value, a plain string column, a zod-parsed literal union, or a form
// field -- all of those satisfy `string` with no import needed, and this
// file stays dependency-free (no `@/lib/db`, no `@prisma/client`) so it's
// safely importable from pure validation modules and their unit tests.
const ADMIN_ROLES: ReadonlySet<string> = new Set(["ADMIN", "DEVELOPER"]);

/** True for ADMIN and DEVELOPER, false for MANAGER (or anything else). */
export function isAdminRole(role: string | null | undefined): boolean {
  return role != null && ADMIN_ROLES.has(role);
}
