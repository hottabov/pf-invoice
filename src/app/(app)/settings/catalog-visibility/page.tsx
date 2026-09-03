import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EyeOff } from "lucide-react";
import { auth } from "@/auth";
import { listUsersWithHiddenCounts, type UserVisibilitySummary } from "@/lib/queries/catalog-visibility-admin";
import {
  PageHeader,
  TableShell,
  RowCell,
  tableClassName,
  tableHeadRowClassName,
  tableRowClassName,
  StatusBadge,
  EmptyState,
} from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Catalog visibility" };
export const dynamic = "force-dynamic";

export default async function CatalogVisibilityPage() {
  // See src/app/(app)/settings/content/page.tsx for why this is notFound()
  // rather than a redirect: a Manager hitting a stale bookmark shouldn't be
  // told the page exists at all.
  const session = await auth();
  if (session?.user?.role !== "ADMIN") notFound();

  const users = await listUsersWithHiddenCounts();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Catalog visibility"
        description="Hide series or products from a salesperson's own catalogue — the product stays absent everywhere they'd meet it, not just unpriced."
      />

      {users.length === 0 ? (
        <EmptyState icon={EyeOff} title="No users yet" description="Add a user first, under Settings → Users." />
      ) : (
        <TableShell
          table={
            <table className={tableClassName}>
              <thead>
                <tr className={tableHeadRowClassName}>
                  <th scope="col" className="px-4 py-3">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Hidden items
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow key={u.id} user={u} />
                ))}
              </tbody>
            </table>
          }
          cards={users.map((u) => (
            <UserCard key={u.id} user={u} />
          ))}
        />
      )}
    </div>
  );
}

function UserRow({ user: u }: { user: UserVisibilitySummary }) {
  const href = `/settings/catalog-visibility/${u.id}`;
  return (
    <tr className={tableRowClassName}>
      <RowCell href={href} primary={`Open ${u.name ?? u.email}`}>
        <span className="text-sm font-medium text-brand-dark">{u.name ?? "—"}</span>
      </RowCell>
      <RowCell href={href}>
        <span className="text-sm text-slate-600">{u.email}</span>
      </RowCell>
      <RowCell href={href}>
        <StatusBadge tone={u.active ? "green" : "slate"}>{u.active ? "Active" : "Inactive"}</StatusBadge>
      </RowCell>
      <RowCell href={href} align="right">
        <span className={cn("text-sm", u.hiddenCount > 0 ? "font-medium text-brand-dark" : "text-slate-400")}>
          {u.hiddenCount}
        </span>
      </RowCell>
    </tr>
  );
}

function UserCard({ user: u }: { user: UserVisibilitySummary }) {
  return (
    <Link
      href={`/settings/catalog-visibility/${u.id}`}
      className="focus-ring flex min-h-12 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-colors active:bg-slate-100"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-brand-dark">{u.name ?? "—"}</p>
          <p className="truncate text-sm text-slate-500">{u.email}</p>
        </div>
        <StatusBadge tone={u.active ? "green" : "slate"} className="shrink-0">
          {u.active ? "Active" : "Inactive"}
        </StatusBadge>
      </div>
      <p className="text-sm text-slate-500">
        {u.hiddenCount} hidden {u.hiddenCount === 1 ? "item" : "items"}
      </p>
    </Link>
  );
}
