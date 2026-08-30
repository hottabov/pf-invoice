"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { fieldInputClass, StatusBadge } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
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
      className="flex flex-col gap-2 border-b border-slate-100 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
    >
      <input type="hidden" name="regionCode" value={row.regionCode} />
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5 sm:flex-none sm:w-32">
        <span className="text-sm font-medium text-brand-dark">{row.regionCode}</span>
        <span className="text-xs text-slate-500">{row.currency}</span>
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
          className={cn(fieldInputClass, "text-right tabular-nums")}
        />
        {!readOnly && (
          <Button
            type="submit"
            variant="outline"
            className="h-11 shrink-0 sm:h-9"
            disabled={pending}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
      {row.needsReview ? (
        <StatusBadge tone="amber" className="w-fit shrink-0 sm:ml-1">
          Price required
        </StatusBadge>
      ) : null}
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
 * Amounts are right-aligned with tabular figures per the design direction's
 * numeric-column convention.
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
    <div>
      {rows.map((row) => (
        <PriceRow key={row.regionCode} target={target} row={row} action={action} readOnly={readOnly} />
      ))}
    </div>
  );
}
