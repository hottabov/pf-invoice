"use client";

import { useState } from "react";
import { AutosaveIndicator } from "@/components/builder/autosave-indicator";
import { fieldInputClass, useToast } from "@/components/ui-kit";
import { useAutosave } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";

/**
 * The document-level "Discount %" field. Autosaves `setDocumentDiscount`
 * 800ms after typing settles (see src/lib/use-autosave.ts) — no Save
 * button. Enforced against the same region cap as an item's discount (see
 * `setDocumentDiscount` in src/lib/actions/documents.ts): a MANAGER is
 * blocked outright, the rejection surfacing as the autosave indicator's
 * error message, while an ADMIN's save still succeeds and comes back with
 * `warning` instead, surfaced here as a non-blocking toast — same split as
 * `ItemDiscountField`. Lives in its own "Discounts" section on the builder
 * page; the totals breakdown shows the resulting discount amount once one
 * is set.
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
  const toast = useToast();
  const [pct, setPct] = useState(discountPct ?? "");
  const { status, error } = useAutosave({
    value: pct,
    enabled: !readOnly,
    onSave: async (nextPct) => {
      const formData = new FormData();
      formData.set("pct", nextPct);
      const result = await setDiscountAction(documentId, formData);
      if (result.warning) toast.info(result.warning);
      return result.error ? { error: result.error } : {};
    },
  });

  if (readOnly) {
    return (
      <p className="text-sm text-slate-700">
        {discountPct ? `${discountPct}% off the subtotal` : "No document discount applied."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="document-discount" className="text-sm text-slate-500">
          Discount
        </label>
        <input
          id="document-discount"
          type="text"
          inputMode="decimal"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          placeholder="0"
          className={cn(fieldInputClass, "h-11 w-24 sm:h-10")}
        />
        <span className="text-sm text-slate-500">%</span>
        <AutosaveIndicator status={status} error={error} />
      </div>
    </div>
  );
}
