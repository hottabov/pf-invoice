import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EyeOff } from "lucide-react";
import { auth } from "@/auth";
import { listRegionsWithHiddenCounts, type RegionVisibilitySummary } from "@/lib/queries/catalog-visibility-admin";
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

  const regions = await listRegionsWithHiddenCounts();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Catalog visibility"
        description="Hide series or products from a region's salespeople — the product stays absent everywhere they'd meet it, not just unpriced."
      />

      {regions.length === 0 ? (
        <EmptyState icon={EyeOff} title="No regions yet" description="Add a region first, under Settings → Regions." />
      ) : (
        <TableShell
          table={
            <table className={tableClassName}>
              <thead>
                <tr className={tableHeadRowClassName}>
                  <th scope="col" className="px-4 py-3">
                    Code
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Name
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
                {regions.map((r) => (
                  <RegionRow key={r.id} region={r} />
                ))}
              </tbody>
            </table>
          }
          cards={regions.map((r) => (
            <RegionCard key={r.id} region={r} />
          ))}
        />
      )}
    </div>
  );
}

function RegionRow({ region: r }: { region: RegionVisibilitySummary }) {
  const href = `/settings/catalog-visibility/${r.id}`;
  return (
    <tr className={tableRowClassName}>
      <RowCell href={href} primary={`Open ${r.name}`}>
        <span aria-hidden="true" className="font-mono text-sm font-medium text-brand-dark">
          {r.code}
        </span>
      </RowCell>
      <RowCell href={href}>
        <span className="text-sm text-slate-600">{r.name}</span>
      </RowCell>
      <RowCell href={href}>
        <StatusBadge tone={r.active ? "green" : "slate"}>{r.active ? "Active" : "Inactive"}</StatusBadge>
      </RowCell>
      <RowCell href={href} align="right">
        <span className={cn("text-sm", r.hiddenCount > 0 ? "font-medium text-brand-dark" : "text-slate-400")}>
          {r.hiddenCount}
        </span>
      </RowCell>
    </tr>
  );
}

function RegionCard({ region: r }: { region: RegionVisibilitySummary }) {
  return (
    <Link
      href={`/settings/catalog-visibility/${r.id}`}
      className="focus-ring flex min-h-12 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-colors active:bg-slate-100"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium text-brand-dark">{r.code}</p>
          <p className="truncate text-sm text-slate-500">{r.name}</p>
        </div>
        <StatusBadge tone={r.active ? "green" : "slate"} className="shrink-0">
          {r.active ? "Active" : "Inactive"}
        </StatusBadge>
      </div>
      <p className="text-sm text-slate-500">
        {r.hiddenCount} hidden {r.hiddenCount === 1 ? "item" : "items"}
      </p>
    </Link>
  );
}
