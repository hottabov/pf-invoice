"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldInputClass, useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/catalog";

/**
 * Admin-only inline "Max discount: X% [edit]" control on a /catalog series
 * card. Deliberately placed *outside* the card's own `<Link>` (see
 * CatalogPage) — nesting an interactive edit form inside an `<a>` would be
 * invalid HTML and would also fight the link for clicks, so this renders as
 * its own row below the link instead of overlapping it.
 *
 * Reads start collapsed (just the current value + an Edit button); clicking
 * Edit swaps in a small form (bound to `updateSeriesMaxDiscount`) with
 * Save/Cancel. `router.refresh()` after a successful save re-fetches the
 * server-rendered card list so this collapses back to the new read-only
 * value, mirroring the refresh-after-mutate pattern `RegionPane` uses for
 * content-block region overrides.
 */
export function SeriesDiscountEditor({
  seriesId,
  maxDiscountPct,
  action,
}: {
  seriesId: string;
  maxDiscountPct: string | null;
  action: (seriesId: string, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await action(seriesId, formData);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Discount cap updated");
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>{maxDiscountPct !== null ? `Max discount: ${maxDiscountPct}%` : "No discount cap"}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit max discount"
          className="focus-ring inline-flex size-11 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-50 hover:text-brand-dark sm:size-7"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <label htmlFor={`series-${seriesId}-max-discount`} className="text-xs font-medium text-slate-500">
        Max discount %
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`series-${seriesId}-max-discount`}
          name="maxDiscountPct"
          type="text"
          inputMode="decimal"
          defaultValue={maxDiscountPct ?? ""}
          placeholder="No cap"
          disabled={pending}
          className={cn(fieldInputClass, "h-9 text-sm")}
        />
        <Button type="submit" size="sm" disabled={pending} className="h-9 bg-brand text-white hover:bg-brand/90">
          {pending ? "…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            setEditing(false);
          }}
          className="h-9"
        >
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
