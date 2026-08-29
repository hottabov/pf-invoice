"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/catalog/field";
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
      <span className="text-xs text-muted-foreground">Discount: {discountPct}%</span>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="flex flex-wrap items-center gap-1.5">
        <label
          htmlFor={`${itemId}-item-discount`}
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          Discount
          <input
            id={`${itemId}-item-discount`}
            name="pct"
            type="text"
            inputMode="decimal"
            defaultValue={discountPct ?? ""}
            placeholder="0"
            className={`${inputClass} h-8 w-16 text-right`}
          />
          %
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "…" : "Save"}
        </Button>
        {maxDiscountPct ? (
          <span className="text-[11px] text-muted-foreground">max {maxDiscountPct}%</span>
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
