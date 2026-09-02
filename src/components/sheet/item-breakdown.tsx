import { formatMoney } from "@/lib/format";
import type { ItemBreakdown } from "@/lib/sheet-data";

/**
 * The one place the base/options/discount/subtotal idea is expressed (see
 * `ItemBreakdown`'s doc comment in src/lib/sheet-data.ts for the bug this
 * fixes) — used by `quotation-sheet.tsx` and `document-sheet.tsx`, rendering
 * a run of `<tr>`s inside the caller's own `.pq-item-group` `<tbody>`. Only
 * `code` is taken as a label — the item's own name/description/thumbnail
 * stay hand-rolled in each caller's own header row, since those aren't part
 * of the money breakdown this component owns.
 *
 * This component's whole markup is posted to Gotenberg as a raw HTML string
 * for both sheets (see quotation-sheet.tsx's/document-sheet.tsx's own doc
 * comments), so it — and everything it imports — must stay free of
 * `"use client"`, Tailwind, and event handlers. The builder used to reuse
 * this same component (a now-removed `"compact"` variant) to show the same
 * base/options/discount/subtotal list on its item cards; it now has its own
 * copy instead (`src/components/builder/item-breakdown-editor.tsx`), because
 * that copy needs exactly the things this file may never have — client-side
 * state and click handlers, to make each price editable in place.
 *
 * Rules:
 * - The base price row always renders, labelled with `code`, with a bare
 *   quantity (`breakdown.qty` — always 1 today, a product line is always one
 *   machine) in the same column shape the option rows use, so the machine
 *   reads as the first line of its own list rather than a differently
 *   formatted heading. The quantity renders regardless of `showPrices`; only
 *   the price itself is gated.
 * - Every option row always renders — `code`/name (as "`code` — `name`" when
 *   `code` is set, plain `name` otherwise, exactly this component's old
 *   hand-rolled `OptionRow` formatting), its own `description` underneath
 *   when set, and qty — regardless of `showPrices`. Its own price only
 *   renders when `showPrices` is on AND the option's `lineTotal` is
 *   non-null (already resolved by `buildItemBreakdown` from the
 *   `showOptionPrices` toggle, so this component never has to know the
 *   toggle itself — only whether `lineTotal` is null). The `showPrices`
 *   half of that check is a defense-in-depth backstop for the same "no
 *   money at all" rule below — in correct production data it's redundant (a
 *   `showOptionPrices`-off `lineTotal` is only ever null when
 *   `showItemPrices` is also off, since `showPrices` is `showItemPrices ||
 *   showOptionPrices`), but it keeps the component's own guarantee
 *   self-contained rather than trusting the caller never to hand it an
 *   inconsistent breakdown.
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
        <td className="pq-col-qty">{breakdown.qty}</td>
        <td className="pq-col-amount pq-amount">
          {showPrices ? formatMoney(breakdown.basePrice, currency) : null}
        </td>
      </tr>
      {breakdown.options.map((option, index) => (
        <tr className="pq-option-row" key={`${option.name}-${index}`}>
          <td className="pq-col-item pq-option-indent">
            <div className="pq-option-name">{option.code ? `${option.code} — ${option.name}` : option.name}</div>
            {option.description ? <div className="pq-option-desc">{option.description}</div> : null}
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

/** Shared with `item-breakdown-editor.tsx` (the builder's own copy of this
 * layout — see this file's own doc comment) so the wording ("Discount 5%" /
 * "Discount") never drifts between the print sheets and the builder. Pure
 * and side-effect-free, so importing it into a client component is fine —
 * only JSX-producing code in *this* file is off-limits there. */
export function discountLabel(discount: NonNullable<ItemBreakdown["discount"]>): string {
  return discount.mode === "PERCENT" ? `Discount ${discount.value}%` : "Discount";
}
