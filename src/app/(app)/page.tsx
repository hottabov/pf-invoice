import Link from "next/link";
import type { Metadata } from "next";
import { NAV_ITEMS } from "@/lib/nav-items";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
      {NAV_ITEMS.map(({ href, label, description, icon: Icon }) => (
        <Link
          key={label}
          href={href}
          className="flex min-h-24 flex-col justify-center gap-1 rounded-xl border border-border bg-white p-4 text-brand-dark transition-colors hover:border-brand-accent hover:bg-muted active:bg-muted"
        >
          <span className="flex items-center gap-2 font-medium">
            <Icon className="size-5 text-brand" />
            {label}
          </span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </Link>
      ))}
    </div>
  );
}
