// The Settings area's own left-hand navigation — six sections, each shown
// immediately on click rather than behind an intermediate card (see the
// commit that introduced this file: "feat: settings gets its own
// navigation"). Kept as a plain, dependency-light data module (only
// `lucide-react` icon components and the equally pure `isAdminRole`) so the
// visibility rule below — which section a given role gets to see — is
// unit-testable without a database or a rendered component.
import type { LucideIcon } from "lucide-react";
import { User, SlidersHorizontal, Users, Package, MapPin } from "lucide-react";
import { isAdminRole } from "./roles";

export type SettingsNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Account and Preferences are open to every signed-in user; every other
   * section is ADMIN-or-DEVELOPER only, same as today (see isAdminRole). */
  adminOnly: boolean;
  /** Extra path prefixes (besides `href`) that should also mark this item
   * active. Catalogue bundles two independent list pages — content blocks
   * and option conflict groups — under one nav entry (see the section's own
   * page for the in-page switcher between the two), so both need to light
   * the same nav item up. */
  activePrefixes?: string[];
};

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { href: "/settings", label: "Account", icon: User, adminOnly: false },
  { href: "/settings/preferences", label: "Preferences", icon: SlidersHorizontal, adminOnly: false },
  { href: "/settings/users", label: "Users", icon: Users, adminOnly: true },
  {
    href: "/settings/content",
    label: "Catalogue",
    icon: Package,
    adminOnly: true,
    activePrefixes: ["/settings/option-conflict-groups"],
  },
  { href: "/settings/regions", label: "Regions", icon: MapPin, adminOnly: true },
  // A sixth section, "PathQuote Support", is added by the commit that
  // introduces the support form (src/lib/actions/support.ts) — kept out
  // until that route exists so this list never points at a 404.
];

/**
 * The nav items a user with `role` should actually see — a MANAGER never
 * gets handed an admin-only href to begin with, rather than being routed to
 * a page that then 404s on them (see each section's own page guard for that
 * defense-in-depth check).
 */
export function visibleSettingsNavItems(role: string | null | undefined): SettingsNavItem[] {
  const admin = isAdminRole(role);
  return SETTINGS_NAV_ITEMS.filter((item) => admin || !item.adminOnly);
}
