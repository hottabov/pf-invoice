import { formatMoney } from "@/lib/format";
import type { ItemBreakdown } from "@/lib/sheet-data";

/**
 * The one place the base/options/discount/subtotal idea is expressed (see
 * `ItemBreakdown`'s doc comment in src/lib/sheet-data.ts for the bug this
 * fixes) — used by `quotation-sheet.tsx` and `document-sheet.tsx` (variant
 * `"sheet"`, rendering a run of `<tr>`s inside the caller's own
 * `.pq-item-group` `<tbody>`) and by `builder/items-list.tsx` (variant
 * `"compact"`, a small Tailwind block for the internal builder card). Only
 * `code` is taken as a label — the item's own name/description/thumbnail
 * stay hand-rolled in each caller's own header row, since those aren't part
 * of the money breakdown this component owns.
 *
 * Rules (shared by both variants):
 * - The base price row always renders, labelled with `code` and `Qty 1`
 *   (`breakdown.qty` — always 1 today, a product line is always one
 *   machine). The quantity label renders regardless of `showPrices`; only
 *   the price itself is gated.
 * - Every option row always renders (name + qty); its own price only when
 *   `showPrices` is on AND the option's `lineTotal` is non-null (already
 *   resolved by `buildItemBreakdown` from the `showOptionPrices` toggle, so
 *   this component never has to know the toggle itself — only whether
 *   `lineTotal` is null). The `showPrices` half of that check is a
 *   defense-in-depth backstop for the same "no money at all" rule below —
 *   in correct production data it's redundant (a `showOptionPrices`-off
 *   `lineTotal` is only ever null when `showItemPrices` is also off, since
 *   `showPrices` is `showItemPrices || showOptionPrices`), but it keeps
 *   the component's own guarantee self-contained rather than trusting the
 *   caller never to hand it an inconsistent breakdown.
 * - The discount row renders only when `breakdown.discount` is set AND
 *   `showPrices` is on (a discount is pure money information — nothing
 *   useful to show about it with prices hidden).
 * - The subtotal row renders whenever the item has options AND `showPrices`
 *   is on — regardless of whether individual option prices are shown. This
 *   is what lets a salesperson hide option-level pricing
 *   (`showOptionPrices` off) while still showing an honest per-machine
 *   figure (`showItemPrices` on).
 * - When `showPrices` is false, no money renders anywhere in this
 *   component — the document total is still shown elsewhere, unaffected.
 */
export function ItemBreakdownRows({
  breakdown,
  code,
  currency,
  showPrices,
  variant,
}: {
  breakdown: ItemBreakdown;
  code: string;
  currency: string;
  showPrices: boolean;
  variant: "sheet" | "compact";
}) {
  if (variant === "compact") {
    return <CompactBreakdown breakdown={breakdown} code={code} currency={currency} showPrices={showPrices} />;
  }
  return <SheetBreakdownRows breakdown={breakdown} code={code} currency={currency} showPrices={showPrices} />;
}

/** Shared between both variants so the wording ("Discount 5%" / "Discount")
 * never drifts between the print sheets and the builder. */
function discountLabel(discount: NonNullable<ItemBreakdown["discount"]>): string {
  return discount.mode === "PERCENT" ? `Discount ${discount.value}%` : "Discount";
}

/** `variant="sheet"` — a run of `<tr>`s meant to sit inside the caller's own
 * `<tbody className="pq-item-group">`, right after that item's own name/
 * description header row. Reuses the Investment Summary table's existing
 * `.pq-option-row` / `.pq-option-indent` / `.pq-option-name` /
 * `.pq-discount-row` / `.pq-item-subtotal-row` classes (already present in
 * both quotation-sheet.tsx's and document-sheet.tsx's own `SHEET_CSS`
 * blocks) rather than inventing new ones — the base price row and every
 * option row share that same look by design, distinguished only by their
 * label. */
function SheetBreakdownRows({
  breakdown,
  code,
  currency,
  showPrices,
}: {
  breakdown: ItemBreakdown;
  code: string;
  currency: string;
  showPrices: boolean;
}) {
  return (
    <>
      <tr className="pq-option-row">
        <td className="pq-col-item pq-option-indent">
          <div className="pq-option-name">{code}</div>
        </td>
        <td className="pq-col-qty">Qty {breakdown.qty}</td>
        <td className="pq-col-amount pq-amount">
          {showPrices ? formatMoney(breakdown.basePrice, currency) : null}
        </td>
      </tr>
      {breakdown.options.map((option, index) => (
        <tr className="pq-option-row" key={`${option.name}-${index}`}>
          <td className="pq-col-item pq-option-indent">
            <div className="pq-option-name">{option.name}</div>
          </td>
          <td className="pq-col-qty">{option.qty}</td>
          <td className="pq-col-amount pq-amount">
            {showPrices && option.lineTotal !== null ? formatMoney(option.lineTotal, currency) : null}
          </td>
        </tr>
      ))}
      {breakdown.discount && showPrices ? (
        <tr className="pq-discount-row">
          <td className="pq-col-item pq-option-indent">{discountLabel(breakdown.discount)}</td>
          <td className="pq-col-qty" />
          <td className="pq-col-amount pq-amount">-{formatMoney(breakdown.discount.amount, currency)}</td>
        </tr>
      ) : null}
      {showPrices && breakdown.options.length > 0 ? (
        <tr className="pq-item-subtotal-row">
          <td className="pq-col-item pq-option-indent">{code} subtotal</td>
          <td className="pq-col-qty" />
          <td className="pq-col-amount pq-amount">{formatMoney(breakdown.subtotal, currency)}</td>
        </tr>
      ) : null}
    </>
  );
}

/** `variant="compact"` — the builder's own internal view (`items-list.tsx`),
 * styled with the app's normal Tailwind utilities rather than the sheets'
 * hardcoded print CSS (this markup never gets posted to Gotenberg). Always
 * called with `showPrices={true}` (the builder is internal to the
 * salesperson, who always sees full pricing detail), but the gating logic
 * below still honours whatever it's given rather than assuming that. */
function CompactBreakdown({
  breakdown,
  code,
  currency,
  showPrices,
}: {
  breakdown: ItemBreakdown;
  code: string;
  currency: string;
  showPrices: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <CompactRow
        label={code}
        qty={`Qty ${breakdown.qty}`}
        amount={showPrices ? formatMoney(breakdown.basePrice, currency) : null}
      />
      {breakdown.options.map((option, index) => (
        <CompactRow
          key={`${option.name}-${index}`}
          label={option.name}
          qty={String(option.qty)}
          amount={showPrices && option.lineTotal !== null ? formatMoney(option.lineTotal, currency) : null}
        />
      ))}
      {breakdown.discount && showPrices ? (
        <CompactRow
          label={discountLabel(breakdown.discount)}
          amount={`-${formatMoney(breakdown.discount.amount, currency)}`}
          muted
        />
      ) : null}
      {showPrices && breakdown.options.length > 0 ? (
        <CompactRow label={`${code} subtotal`} amount={formatMoney(breakdown.subtotal, currency)} strong />
      ) : null}
    </div>
  );
}

function CompactRow({
  label,
  qty,
  amount,
  muted = false,
  strong = false,
}: {
  label: string;
  qty?: string;
  amount: string | null;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center justify-between gap-2" +
        (muted ? " italic text-amber-700" : "") +
        (strong ? " font-semibold text-slate-700" : "")
      }
    >
      <span className="truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-2 tabular-nums">
        {qty ? <span className="text-slate-400">{qty}</span> : null}
        {amount ? <span>{amount}</span> : null}
      </span>
    </div>
  );
}
