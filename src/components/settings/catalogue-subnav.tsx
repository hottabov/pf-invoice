import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/content", label: "Content blocks" },
  { href: "/settings/option-conflict-groups", label: "Option conflict groups" },
] as const;

/**
 * The Catalogue nav section bundles two independent list pages — content
 * blocks and option conflict groups — under one entry (see
 * src/lib/settings-nav.ts). This lets a user flip between the two without
 * detouring back through the outer settings nav, the same "no intermediate
 * card to click through" goal the settings redesign applies one level up.
 * Rendered by each of the two list pages themselves, immediately under
 * their `PageHeader`.
 */
export function CatalogueSubnav({ active }: { active: "content" | "option-conflict-groups" }) {
  return (
    <div role="tablist" aria-label="Catalogue" className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
      {TABS.map((tab) => {
        const isActive = tab.href === `/settings/${active}`;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "focus-ring inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
              isActive ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
