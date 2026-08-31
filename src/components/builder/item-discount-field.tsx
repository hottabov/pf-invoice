"use client";

import { useState } from "react";
import { AutosaveIndicator } from "@/components/builder/autosave-indicator";
import { fieldInputClass, useToast } from "@/components/ui-kit";
import { useAutosave } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";

/**
 * Inline "Discount %" field on an item card. Autosaves `setItemDiscount`
 * 800ms after the value stops changing (see src/lib/use-autosave.ts) — no
 * Save button — an empty field clears the discount. The document's region
 * cap (if any) is shown as a hint.
 *
 * A save that exceeds the cap behaves differently by role (enforced
 * server-side in `setItemDiscount`, not here): for a MANAGER it's rejected
 * outright with a "Max discount for <region> is <cap>%" `error`, surfaced
 * by the autosave indicator turning into that message; for an ADMIN it
 * still saves, and the action instead comes back with `warning` set,
 * surfaced here as a non-blocking toast rather than blocking the save.
 */
export function ItemDiscountField({
  itemId,
  discountPct,
  maxDiscountPct,
  setDiscountAction,
  readOnly = false,
}: {
  itemId: string;
  discountPct: string | null;
  maxDiscountPct: string | null;
  setDiscountAction: (itemId: string, formData: FormData) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  const toast = useToast();
  const [pct, setPct] = useState(discountPct ?? "");
  const { status, error } = useAutosave({
    value: pct,
    enabled: !readOnly,
    onSave: async (nextPct) => {
      const formData = new FormData();
      formData.set("pct", nextPct);
      const result = await setDiscountAction(itemId, formData);
      if (result.warning) toast.info(result.warning);
      return result.error ? { error: result.error } : {};
    },
  });

  if (readOnly) {
    return discountPct ? (
      <span className="text-xs text-slate-500">Discount: {discountPct}%</span>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={`${itemId}-item-discount`}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500"
        >
          Discount
          <input
            id={`${itemId}-item-discount`}
            type="text"
            inputMode="decimal"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            placeholder="0"
            className={cn(fieldInputClass, "h-11 w-16 text-right sm:h-9")}
          />
          %
        </label>
        {maxDiscountPct ? (
          <span className="text-[11px] text-slate-400">max {maxDiscountPct}%</span>
        ) : null}
        <AutosaveIndicator status={status} error={error} />
      </div>
    </div>
  );
}
