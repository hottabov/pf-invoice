"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { fieldInputClass, useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";

const initialState: ActionResult = {};

/**
 * Inline "Discount %" field on an item card. Submits `setItemDiscount`
 * directly (a real `<form>`, so it works with `useActionState` and shows
 * its own pending/error state) — an empty field clears the discount. The
 * item's series cap (if any) is shown as a hint.
 *
 * A save that exceeds the cap behaves differently by role (enforced
 * server-side in `setItemDiscount`, not here): for a MANAGER it's rejected
 * outright with a "Max discount for <series> is <cap>%" `error` shown
 * inline; for an ADMIN it still saves, and the action instead comes back
 * with `warning` set, surfaced here as a non-blocking toast rather than
 * blocking the save.
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
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => setDiscountAction(itemId, formData),
    initialState
  );
  const lastWarning = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.warning && state.warning !== lastWarning.current) {
      toast.info(state.warning);
    }
    lastWarning.current = state.warning;
  }, [state.warning, toast]);

  if (readOnly) {
    return discountPct ? (
      <span className="text-xs text-slate-500">Discount: {discountPct}%</span>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={`${itemId}-item-discount`}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500"
        >
          Discount
          <input
            id={`${itemId}-item-discount`}
            name="pct"
            type="text"
            inputMode="decimal"
            defaultValue={discountPct ?? ""}
            placeholder="0"
            className={cn(fieldInputClass, "h-11 w-16 text-right sm:h-9")}
          />
          %
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={pending} className="h-11 sm:h-9">
          {pending ? "…" : "Save"}
        </Button>
        {maxDiscountPct ? (
          <span className="text-[11px] text-slate-400">max {maxDiscountPct}%</span>
        ) : null}
      </form>
      {state.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
