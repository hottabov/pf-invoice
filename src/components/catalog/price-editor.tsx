"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/catalog/field";
import type { ActionResult, PriceTarget } from "@/lib/actions/catalog";

export type PriceRowData = {
  regionCode: string;
  regionName: string;
  currency: string;
  amount: string | null;
  needsReview: boolean;
};

const initialState: ActionResult = {};

function PriceRow({
  target,
  row,
  action,
  readOnly,
}: {
  target: PriceTarget;
  row: PriceRowData;
  action: (target: PriceTarget, formData: FormData) => Promise<ActionResult>;
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => action(target, formData),
    initialState
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
    >
      <input type="hidden" name="regionCode" value={row.regionCode} />
      <div className="flex min-w-[8rem] flex-col">
        <span className="text-sm font-medium text-brand-dark">{row.regionName}</span>
        <span className="text-xs text-muted-foreground">
          {row.regionCode} &middot; {row.currency}
        </span>
      </div>
      <div className="flex flex-1 items-center gap-2">
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          aria-label={`${row.regionName} price`}
          placeholder="e.g. 175000"
          defaultValue={row.amount ?? ""}
          disabled={readOnly}
          className={`${inputClass} sm:max-w-[10rem]`}
        />
        {!readOnly && (
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        )}
        {row.needsReview ? (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
            price required
          </span>
        ) : null}
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive sm:basis-full">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * One row per active region, each an independently-submittable form bound
 * to `upsertPrice` for the given target (a product or an option). Empty
 * amount clears the price; anything else upserts it and clears
 * needsReview. Read-only for non-admins (Managers can view but not edit).
 */
export function PriceEditor({
  target,
  rows,
  action,
  readOnly = false,
}: {
  target: PriceTarget;
  rows: PriceRowData[];
  action: (target: PriceTarget, formData: FormData) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-4">
      {rows.map((row) => (
        <PriceRow key={row.regionCode} target={target} row={row} action={action} readOnly={readOnly} />
      ))}
    </div>
  );
}
