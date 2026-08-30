import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plus, UserRound } from "lucide-react";
import { auth } from "@/auth";
import { listUsers, type UserListItem } from "@/lib/queries/users";
import { buttonVariants } from "@/components/ui/button";
import {
  PageHeader,
  TableShell,
  tableClassName,
  tableHeadRowClassName,
  tableRowClassName,
  StatusBadge,
  STATUS_TONE,
  EmptyState,
} from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  // See src/app/(app)/settings/content/page.tsx for why this is notFound()
  // rather than a redirect: a Manager hitting a stale bookmark shouldn't be
  // told the page exists at all.
  const session = await auth();
  if (session?.user?.role !== "ADMIN") notFound();

  const users = await listUsers();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Users"
        description="Everyone with access to PathQuote."
        actions={
          <Link
            href="/settings/users/new"
            className={cn(buttonVariants(), "h-11 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto")}
          >
            <Plus className="size-4" data-icon="inline-start" aria-hidden="true" />
            Add user
          </Link>
        }
      />

      {users.length === 0 ? (
        <EmptyState icon={UserRound} title="No users yet" description="Add your first teammate above." />
      ) : (
        <TableShell
          table={
            <table className={tableClassName}>
              <thead>
                <tr className={tableHeadRowClassName}>
                  <th scope="col" className="px-4 py-3">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Region
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
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

function UserRow({ user: u }: { user: UserListItem }) {
  return (
    <tr className={cn(tableRowClassName, "relative")}>
      <td className="px-4 py-3 align-middle">
        <Link
          href={`/settings/users/${u.id}`}
          className="absolute inset-0 focus-visible:z-10 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          <span className="sr-only">Open {u.email}</span>
        </Link>
        <span aria-hidden="true" className="relative font-medium text-brand-dark">
          {u.email}
        </span>
        {u.magicLinkOnly ? (
          <span className="relative mt-0.5 block text-xs text-slate-500">Magic link only</span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{u.name ?? "—"}</td>
      <td className="px-4 py-3">
        <StatusBadge tone={STATUS_TONE[u.role]}>{u.role}</StatusBadge>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{u.regionCode ?? "—"}</td>
      <td className="px-4 py-3">
        <StatusBadge tone={u.active ? "green" : "slate"}>{u.active ? "Active" : "Inactive"}</StatusBadge>
      </td>
    </tr>
  );
}

function UserCard({ user: u }: { user: UserListItem }) {
  return (
    <div className="relative flex min-h-12 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-colors active:bg-slate-100">
      <Link
        href={`/settings/users/${u.id}`}
        className="focus-ring absolute inset-0 rounded-xl focus-visible:z-10"
      >
        <span className="sr-only">Open {u.email}</span>
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div className="relative min-w-0">
          <p className="truncate font-medium text-brand-dark">{u.email}</p>
          <p className="truncate text-sm text-slate-500">{u.name ?? "No name set"}</p>
        </div>
        <StatusBadge tone={u.active ? "green" : "slate"} className="relative shrink-0">
          {u.active ? "Active" : "Inactive"}
        </StatusBadge>
      </div>
      <div className="relative flex items-center justify-between gap-3 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <StatusBadge tone={STATUS_TONE[u.role]}>{u.role}</StatusBadge>
          <span>{u.regionCode ?? "No region"}</span>
        </div>
        {u.magicLinkOnly ? <span className="shrink-0 text-xs">Magic link only</span> : null}
      </div>
    </div>
  );
}
