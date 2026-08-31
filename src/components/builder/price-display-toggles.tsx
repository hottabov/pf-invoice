"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui-kit";
import type { ActionResult } from "@/lib/actions/documents";

type PriceDisplayState = { showItemPrices: boolean; showOptionPrices: boolean };

/**
 * "Quotation pricing display" toggle pair (owner spec): the client always
 * sees the grand total up top regardless of these — they only control how
 * much per-item/per-option detail the investment summary and equipment
 * write-ups reveal underneath it. Only ever rendered on a QUOTE (see the
 * builder page) and only while DRAFT.
 *
 * Both flags always submit together in one `setPriceDisplayAction` call
 * (there's no partial-update action, unlike the per-item discount field) —
 * flipping "Show option prices" on also flips "Show item prices" on in the
 * same request, mirroring the rendering rule an option's price only makes
 * sense next to a visible item total (see `QuotationData.showItemPrices`'s
 * doc comment in src/lib/quotation-data.ts). Optimistic like
 * `ItemShowImageToggle`: the checkboxes reflect the click immediately and
 * revert to the last-known-good server state if the save is rejected.
 */
export function PriceDisplayToggles({
  documentId,
  showItemPrices,
  showOptionPrices,
  setPriceDisplayAction,
  readOnly = false,
}: {
  documentId: string;
  showItemPrices: boolean;
  showOptionPrices: boolean;
  setPriceDisplayAction: (documentId: string, input: PriceDisplayState) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  const toast = useToast();
  const [state, setState] = useState<PriceDisplayState>({ showItemPrices, showOptionPrices });
  const [pending, startTransition] = useTransition();

  function commit(next: PriceDisplayState) {
    const previous = state;
    setState(next);
    startTransition(async () => {
      const result = await setPriceDisplayAction(documentId, next);
      if (result?.error) {
        setState(previous);
        toast.error(result.error);
      }
    });
  }

  if (readOnly) {
    const label =
      state.showOptionPrices
        ? "Item and option prices shown"
        : state.showItemPrices
          ? "Item prices shown"
          : "Only the grand total is shown";
    return <p className="text-sm text-slate-700">{label}.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-11 items-center justify-between gap-3">
        <span className="text-sm font-medium text-brand-dark">Show item prices</span>
        <input
          type="checkbox"
          checked={state.showItemPrices}
          disabled={pending}
          onChange={(event) => {
            const showItemPrices = event.target.checked;
            // Turning item prices off also turns option prices off — an
            // option price with no visible item total makes no sense.
            commit({ showItemPrices, showOptionPrices: showItemPrices && state.showOptionPrices });
          }}
          className="size-4 rounded border-slate-300 accent-brand disabled:cursor-not-allowed"
        />
      </label>
      <label className="flex h-11 items-center justify-between gap-3">
        <span className="text-sm font-medium text-brand-dark">Show option prices</span>
        <input
          type="checkbox"
          checked={state.showOptionPrices}
          disabled={pending}
          onChange={(event) => {
            const showOptionPrices = event.target.checked;
            // Turning option prices on always brings item prices on with it.
            commit({ showItemPrices: showOptionPrices || state.showItemPrices, showOptionPrices });
          }}
          className="size-4 rounded border-slate-300 accent-brand disabled:cursor-not-allowed"
        />
      </label>
      <p className="text-xs text-slate-500">Client sees only the grand total unless enabled.</p>
    </div>
  );
}
