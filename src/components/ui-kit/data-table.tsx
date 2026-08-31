import Link from "next/link";
import { cn } from "@/lib/utils";

type TableShellProps = {
  /** A `<table>` (thead+tbody), shown md+ inside a bordered, scrollable card. */
  table: React.ReactNode;
  /** A stacked list of cards, shown below md instead of the table. */
  cards: React.ReactNode;
  className?: string;
};

/**
 * The list-page responsive split used across Documents/Clients/Catalog: a
 * real `<table>` on md+ (inside an overflow-x wrapper so wide tables scroll
 * instead of breaking layout) and a stacked-card list on mobile. Callers
 * build both renderings themselves and hand them in as two explicit slots —
 * kept deliberately simple rather than a generic column-driven table
 * component, since each screen's row shape differs enough that a shared
 * abstraction would just get in the way.
 */
export function TableShell({ table, cards, className }: TableShellProps) {
  return (
    <div className={className}>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        {table}
      </div>
      <div className="flex flex-col gap-3 md:hidden">{cards}</div>
    </div>
  );
}

/** Shared `<table>` element classes — 14px body text per the design
 * direction, hairline row dividers, sticky-safe header. Use directly on the
 * `<table>` a caller passes as TableShell's `table` slot. */
export const tableClassName = "w-full min-w-[560px] text-sm";

/** Shared `<thead>` row classes: uppercase muted labels, hairline bottom
 * border separating the header from body rows. */
export const tableHeadRowClassName =
  "border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500 uppercase";

/** Shared `<tbody>` row classes: hairline divider between rows, hover
 * affordance (desktop-only, per the design direction), and a min-height
 * tall enough that row padding alone won't create sub-44px touch targets on
 * a stray touch-enabled desktop. */
export const tableRowClassName =
  "border-b border-slate-100 last:border-b-0 transition-colors md:hover:bg-slate-50";

/**
 * One cell of a clickable table row. Each `<td>` gets its own full-cell
 * `<Link>` (padding moved off the `<td>` and onto the `<a>`, so the link's
 * box exactly fills the cell) rather than a single `absolute inset-0` link
 * positioned against the `<tr>` — `position: relative` on a `<tr>` isn't a
 * reliable containing block for an absolutely-positioned child across
 * browsers/table layout modes, which was the actual bug (clicking a cell's
 * own text didn't navigate: the overlay link was being sized/positioned
 * against whatever ancestor *did* establish a containing block, not the row
 * directly). A real, normal-flow link per cell has no such ambiguity and
 * needs no absolute positioning at all.
 *
 * Only one cell in a row should pass `primary` — it's the one announced/
 * focusable as a link; the rest are `aria-hidden`/`tabIndex={-1}` so mouse
 * users get full-row click coverage while keyboard/screen-reader users still
 * see exactly one "Open {row}" stop per row.
 */
export function RowCell({
  href,
  children,
  primary,
  align,
}: {
  href: string;
  children: React.ReactNode;
  primary?: string;
  align?: "right";
}) {
  return (
    <td className="p-0 align-middle">
      <Link
        href={href}
        aria-label={primary}
        aria-hidden={primary ? undefined : true}
        tabIndex={primary ? undefined : -1}
        className={cn("focus-ring block px-4 py-3", align === "right" && "text-right")}
      >
        {children}
      </Link>
    </td>
  );
}
