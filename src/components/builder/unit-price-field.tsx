"use client";

import { useState, useTransition } from "react";
import { AutosaveIndicator } from "@/components/builder/autosave-indicator";
import { fieldInputClass, useToast } from "@/components/ui-kit";
import { useAutosave } from "@/lib/use-autosave";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";

/**
 * Inline, hand-editable unit price for a priced row (an item itself, or one
 * of its OPTION lines) — the highest-risk piece of the P0 manual-price
 * feature (owner: "if I give it away for zero dollars... I give them back
 * zero dollars"). Autosaves `setUnitPriceAction` 800ms after the value stops
 * changing, same debounce-no-Save-button pattern as `ItemDiscountField`/
 * `ValidityDaysField` — no client-side floor, `0` is accepted and saved like
 * any other value (the server's `unitPriceSchema` is the only real gate:
 * non-negative, 2dp).
 *
 * When the current value differs from `listPrice` (the catalogue price
 * snapshotted when the row was added — see `DocumentItem.listPrice`/
 * `DocumentLine.listPrice`), the list price renders struck through beside
 * the field, with a "Reset to list" button that calls
 * `resetUnitPriceAction` directly (not through the debounced field) so the
 * concession is undone in one click rather than requiring the list figure
 * to be re-typed by hand.
 *
 * A save that pushes the *whole document's* concession over the region cap
 * is enforced server-side (`recalcAndEnforce`, src/lib/actions/documents.ts)
 * exactly like `ItemDiscountField`'s per-item cap: rejected outright for a
 * MANAGER (surfaced here as the autosave error), non-blocking for an ADMIN
 * (surfaced as a toast, save still applied).
 */
export function UnitPriceField({
  id,
  unitPrice,
  listPrice,
  currency,
  label = "Price",
  setUnitPriceAction,
  resetUnitPriceAction,
  readOnly = false,
}: {
  id: string;
  unitPrice: string;
  listPrice: string | null;
  currency: string;
  label?: string;
  setUnitPriceAction: (id: string, formData: FormData) => Promise<ActionResult>;
  resetUnitPriceAction: (id: string) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  const toast = useToast();
  const [value, setValue] = useState(unitPrice);
  const [resetting, startReset] = useTransition();

  const { status, error } = useAutosave({
    value,
    enabled: !readOnly,
    onSave: async (next) => {
      const formData = new FormData();
      formData.set("unitPrice", next);
      const result = await setUnitPriceAction(id, formData);
      if (result.warning) toast.info(result.warning);
      return result.error ? { error: result.error } : {};
    },
  });

  // A blank field mid-edit never counts as "different from list" — only a
  // parseable, actually-typed value does.
  const numericValue = value.trim() === "" ? null : Number(value);
  const hasConcession =
    listPrice !== null && numericValue !== null && Number.isFinite(numericValue) && Number(listPrice) !== numericValue;

  function reset() {
    startReset(async () => {
      const result = await resetUnitPriceAction(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.warning) toast.info(result.warning);
      if (listPrice !== null) setValue(listPrice);
    });
  }

  if (readOnly) {
    const currentListPrice = listPrice !== null && Number(listPrice) !== Number(unitPrice) ? listPrice : null;
    return (
      <span className="flex items-baseline gap-1.5 text-sm font-medium tabular-nums text-brand-dark">
        {currentListPrice ? (
          <span className="text-xs text-slate-400 line-through">{formatMoney(currentListPrice, currency)}</span>
        ) : null}
        {formatMoney(unitPrice, currency)}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        htmlFor={`${id}-unit-price`}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-500"
      >
        {label}
        <input
          id={`${id}-unit-price`}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={cn(fieldInputClass, "h-11 w-24 text-right sm:h-9")}
        />
      </label>
      {hasConcession ? (
        <>
          <span className="text-xs text-slate-400 line-through">{formatMoney(listPrice!, currency)}</span>
          <button
            type="button"
            onClick={reset}
            disabled={resetting}
            className="focus-ring rounded text-xs font-medium text-brand hover:underline disabled:opacity-50"
          >
            Reset to list
          </button>
        </>
      ) : null}
      <AutosaveIndicator status={status} error={error} />
    </div>
  );
}
