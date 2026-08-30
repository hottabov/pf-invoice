"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { fieldInputClass } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";

const initialState: ActionResult = {};

/**
 * Inline "Discount %" field on an item card. Submits `setItemDiscount`
 * directly (a real `<form>`, so it works with `useActionState` and shows
 * its own pending/error state) — an empty field clears the discount. The
 * item's series cap (if any) is shown as a hint; a save that exceeds it is
 * rejected server-side with a "Max discount for <series> is <cap>%" error
 * shown here rather than silently clamped.
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
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => setDiscountAction(itemId, formData),
    initialState
  );

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
