"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/catalog/field";
import type { ActionResult } from "@/lib/actions/documents";

const initialState: ActionResult = {};

/**
 * The document-level "Discount %" field. Unlike an item's discount, there's
 * no series cap here — any 0..100 value (or empty, to clear) is accepted.
 * Lives in its own "Discounts" section on the builder page; the sticky
 * footer shows the resulting discount amount once one is set.
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
      <p className="text-sm text-foreground">
        {discountPct ? `${discountPct}% off the subtotal` : "No document discount applied."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <label htmlFor="document-discount" className="text-sm text-muted-foreground">
          Discount
        </label>
        <input
          id="document-discount"
          name="pct"
          type="text"
          inputMode="decimal"
          defaultValue={discountPct ?? ""}
          placeholder="0"
          className={`${inputClass} h-9 w-24`}
        />
        <span className="text-sm text-muted-foreground">%</span>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
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
