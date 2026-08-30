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
