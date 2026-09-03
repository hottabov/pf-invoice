// Pure scoping helpers: given the current user (id + role), return the
// Prisma `where` fragment that restricts a query to what that user is
// allowed to see. ADMIN (and DEVELOPER — see isAdminRole) sees everything
// (an empty filter); MANAGER is restricted to their own companies/documents
// (spec §6). Kept dependency free (no `@/lib/db` import) so these are
// trivially unit-testable and safe to import from both server
// actions/queries and plain tests.

import { isAdminRole } from "./roles";

export type ScopeUser = { id: string; role: string };

/** Restricts a Company query to companies owned by `user`, or `{}` (no
 * restriction) for an admin. Spread this into a Prisma `where` object,
 * merging with any other filters (e.g. a search term) the caller applies. */
export function companyWhereForUser(user: ScopeUser): { ownerId?: string } {
  if (isAdminRole(user.role)) return {};
  return { ownerId: user.id };
}

/** Restricts a Document query to documents authored by `user`, or `{}` (no
 * restriction) for an admin. */
export function documentWhereForUser(user: ScopeUser): { authorId?: string } {
  if (isAdminRole(user.role)) return {};
  return { authorId: user.id };
}
