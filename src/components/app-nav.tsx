"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type AppNavProps = {
  variant: "sidebar" | "bottom";
};

// Client component so it can read the current path (via usePathname) to
// highlight the active nav item. Rendered twice by AppShell: once as a
// vertical sidebar (md+) and once as a fixed bottom bar (mobile).
export function AppNav({ variant }: AppNavProps) {
  const pathname = usePathname();

  if (variant === "sidebar") {
    return (
      <nav aria-label="Main" className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-dark transition-colors hover:bg-muted",
                active && "bg-brand text-white hover:bg-brand"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="grid grid-cols-4">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className="flex flex-col items-center justify-center gap-1 py-2 text-xs text-brand-dark active:bg-muted"
          >
            <Icon className={cn("size-5", active ? "text-brand-accent" : "text-brand")} />
            <span className={cn(active && "font-semibold text-brand-accent")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
