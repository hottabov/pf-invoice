import type { Session } from "next-auth";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * Require an authenticated session for a server component/action. Redirects
 * to /login when there is none. The proxy in front of this app already
 * guarantees an authenticated request reaches app routes, but this is the
 * defense-in-depth check for server actions and any route the proxy doesn't
 * cover (e.g. a revoked token that hasn't hit the proxy's revalidation
 * window yet).
 */
export async function requireSession(): Promise<Session & { user: NonNullable<Session["user"]> }> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session as Session & { user: NonNullable<Session["user"]> };
}

/**
 * Require an authenticated ADMIN session. Managers may view the catalog but
 * only admins may mutate it — call this at the top of every catalog
 * server action.
 */
export async function requireAdmin(): Promise<Session & { user: NonNullable<Session["user"]> }> {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("Forbidden: admin only");
  }
  return session;
}
