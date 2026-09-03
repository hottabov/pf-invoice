"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldInputClass, useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { CommissionTier } from "@/lib/pricing";
import type { ActionResult } from "@/lib/actions/settings";

const MAX_ROWS = 12;

/** One edited row — only the upper bound and the rate are ever typed; a
 * row's `minPct` is always derived from the row before it (see `toTiers`
 * below), and the LAST row is always rendered as "and above" with no upper
 * bound at all. This is what makes the table impossible to submit with a
 * gap or an overlap through this editor: `validateCommissionTiers`
 * (src/lib/pricing.ts) still runs server-side on save, but a hand-typed
 * mistake here can only ever be "wrong boundary", never "disconnected
 * range". */
type TierRow = { id: string; upToPct: string; ratePct: string };

let rowCounter = 0;
function nextRowId(): string {
  rowCounter += 1;
  return `commission-tier-row-${rowCounter}`;
}

function rowsFromTiers(tiers: CommissionTier[]): TierRow[] {
  return tiers.map((tier) => ({
    id: nextRowId(),
    upToPct: tier.maxPct === null ? "" : String(tier.maxPct),
    ratePct: String(tier.ratePct),
  }));
}

/** Turns the edited rows into the `{minPct,maxPct,ratePct}[]` shape
 * `commissionTiersSchema`/`validateCommissionTiers` expect. `minPct` is
 * derived, not read from any input — 0 for the first row, and one
 * hundredth of a percent past the previous row's `maxPct` for every row
 * after that — and the last row's `maxPct` is always `null`, regardless of
 * what (if anything) its now-hidden upper-bound field once held. */
function toTiers(rows: TierRow[]): CommissionTier[] {
  let minPct = 0;
  return rows.map((row, index) => {
    const isLast = index === rows.length - 1;
    const upToPct = Number(row.upToPct);
    const maxPct = isLast ? null : Number.isFinite(upToPct) ? upToPct : 0;
    const ratePctRaw = Number(row.ratePct);
    const tier: CommissionTier = { minPct, maxPct, ratePct: Number.isFinite(ratePctRaw) ? ratePctRaw : 0 };
    if (maxPct !== null) minPct = Math.round((maxPct + 0.01) * 100) / 100;
    return tier;
  });
}

/**
 * ADMIN-only editor for the "commission.tiers" app setting (the discount %
 * -> commission % table — see `computeTotals`'s commission section,
 * src/lib/pricing.ts), rendered in the Preferences card on
 * /settings/preferences. Same transition+toast pattern as
 * `QuoteValidityForm` (a single explicit Save, not per-row autosave), with
 * a dynamic row editor mirroring `BankDetailsEditor`
 * (src/components/regions/bank-details-editor.tsx) for the add/remove-row
 * mechanics.
 *
 * Deliberately does NOT let the admin type a row's lower bound, or mark any
 * row but the last one "open" — see `toTiers` above for why that keeps a
 * gap or an overlap from ever leaving this form, even though the save path
 * validates the submitted table again regardless (a hand-crafted request
 * bypasses this component entirely).
 */
export function CommissionTiersForm({
  action,
  defaultValue,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  defaultValue: CommissionTier[];
}) {
  const [rows, setRows] = useState<TierRow[]>(() => rowsFromTiers(defaultValue));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function updateRow(id: string, patch: Partial<Pick<TierRow, "upToPct" | "ratePct">>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function addRow() {
    setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, { id: nextRowId(), upToPct: "", ratePct: "" }]));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("value", JSON.stringify(toTiers(rows)));
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Saved");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-brand-dark">Commission tiers</span>
        <p className="text-sm text-slate-500">
          The commission rate a salesperson earns, by the quote&apos;s own discount percentage. Each row covers up
          to (and including) the percentage typed, before the next row starts. Clear every row to stop showing a
          commission figure in the builder.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No commission tiers — the builder won&apos;t show a commission figure.</p>
      ) : null}

      {rows.map((row, index) => {
        const isLast = index === rows.length - 1;
        return (
          <div key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-20 shrink-0 text-sm text-slate-500">{isLast ? "and above" : "Up to"}</span>
            {isLast ? (
              <span className="hidden sm:block sm:w-32" aria-hidden="true" />
            ) : (
              <input
                aria-label={`Tier ${index + 1} upper bound, percent`}
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={row.upToPct}
                onChange={(e) => updateRow(row.id, { upToPct: e.target.value })}
                disabled={pending}
                className={cn(fieldInputClass, "sm:w-32")}
              />
            )}
            <input
              aria-label={`Tier ${index + 1} rate, percent`}
              placeholder="Rate %"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={row.ratePct}
              onChange={(e) => updateRow(row.id, { ratePct: e.target.value })}
              disabled={pending}
              className={cn(fieldInputClass, "sm:w-32")}
            />
            {pending ? null : (
              <Button
                type="button"
                variant="outline"
                onClick={() => removeRow(row.id)}
                className="h-11 shrink-0 sm:w-11"
                aria-label={`Remove tier ${index + 1}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        );
      })}

      {!pending && rows.length < MAX_ROWS ? (
        <Button type="button" variant="outline" onClick={addRow} className="h-11 w-full sm:w-auto sm:self-start">
          <Plus className="size-4" data-icon="inline-start" aria-hidden="true" />
          Add tier
        </Button>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-11 w-full sm:w-auto sm:self-start" variant="outline">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
