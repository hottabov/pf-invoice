import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText, Search } from "lucide-react";
import { auth } from "@/auth";
import { listContentBlocks } from "@/lib/queries/content";
import { PageHeader, SectionCard, StatusBadge, EmptyState, fieldInputClass } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Content blocks" };
export const dynamic = "force-dynamic";

/** Human-readable label for each key prefix — falls back to the raw prefix
 * (capitalized) for any group not in this list. */
const GROUP_LABELS: Record<string, string> = {
  machine: "Machine",
  option: "Options",
  software: "Software",
  equipment: "Equipment",
  terms: "Terms",
  conditions: "Conditions",
  rsp: "RSP",
};

function groupLabel(prefix: string): string {
  return GROUP_LABELS[prefix] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

type SearchParams = { q?: string };

export default async function ContentBlocksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // AppLayout already calls requireSession and redirects unauthenticated
  // requests, so a session is always present here — only the role needs
  // checking. Managers can view everything else in Settings but not this
  // page, per the phase-6 spec: a 404 rather than a redirect, since a
  // Manager clicking a stale bookmark shouldn't be told a page exists.
  const session = await auth();
  if (session?.user?.role !== "ADMIN") notFound();

  const { q } = await searchParams;
  const groups = await listContentBlocks();
  const totalCount = groups.reduce((sum, g) => sum + g.blocks.length, 0);

  const term = q?.trim().toLowerCase();
  const filteredGroups = term
    ? groups
        .map((group) => ({
          ...group,
          blocks: group.blocks.filter(
            (b) => b.key.toLowerCase().includes(term) || (b.title ?? "").toLowerCase().includes(term)
          ),
        }))
        .filter((group) => group.blocks.length > 0)
    : groups;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Content blocks"
        description="Reusable quote text — machine descriptions, options, terms, and conditions."
      />

      <form method="GET" className="sm:w-80">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            aria-label="Search content blocks"
            placeholder="Search by key or title…"
            className={cn(fieldInputClass, "pl-9")}
          />
        </div>
      </form>

      {totalCount === 0 ? (
        <EmptyState
          icon={FileText}
          title="No content blocks yet"
          description="Run the database seed to populate the default content blocks."
        />
      ) : filteredGroups.length === 0 ? (
        <EmptyState icon={FileText} title="No blocks match your search" description="Try a different search term." />
      ) : (
        filteredGroups.map((group) => (
          <SectionCard key={group.prefix} title={groupLabel(group.prefix)}>
            <div className="flex flex-col">
              {group.blocks.map((block) => (
                <Link
                  key={block.key}
                  href={`/settings/content/${encodeURIComponent(block.key)}`}
                  className="focus-ring flex min-h-11 flex-col gap-1 border-b border-slate-100 py-3 transition-colors last:border-b-0 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-mono text-xs text-slate-500">{block.key}</span>
                    <span className="truncate text-sm font-medium text-brand-dark">{block.title ?? "—"}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-500">{block.bodyLength.toLocaleString()} chars</span>
                    {block.hasRegionOverrides ? (
                      <StatusBadge tone="brand-outline">Customized per region</StatusBadge>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>
        ))
      )}
    </div>
  );
}
