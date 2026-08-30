"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { fieldInputClass } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";

const initialState: ActionResult = {};

/**
 * The document-level "Discount %" field. Unlike an item's discount, there's
 * no series cap here — any 0..100 value (or empty, to clear) is accepted.
 * Lives in its own "Discounts" section on the builder page; the totals
 * breakdown shows the resulting discount amount once one is set.
 */
export function DocumentDiscountField({
  documentId,
  discountPct,
  setDiscountAction,
  readOnly = false,
}: {
  documentId: string;
  discountPct: string | null;
  setDiscountAction: (documentId: string, formData: FormData) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => setDiscountAction(documentId, formData),
    initialState
  );

  if (readOnly) {
    return (
      <p className="text-sm text-slate-700">
        {discountPct ? `${discountPct}% off the subtotal` : "No document discount applied."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <label htmlFor="document-discount" className="text-sm text-slate-500">
          Discount
        </label>
        <input
          id="document-discount"
          name="pct"
          type="text"
          inputMode="decimal"
          defaultValue={discountPct ?? ""}
          placeholder="0"
          className={cn(fieldInputClass, "h-10 w-24")}
        />
        <span className="text-sm text-slate-500">%</span>
        <Button type="submit" variant="outline" size="sm" disabled={pending} className="h-10">
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
