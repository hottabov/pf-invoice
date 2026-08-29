"use client";

import { useState, useTransition } from "react";
import { Plus, ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";
import type { ItemPickerSeries } from "@/lib/queries/documents";

/**
 * "Add item" for the builder: a two-step picker over the whole catalog tree
 * (preloaded server-side, see getItemPickerCatalog) — series list, then
 * that series' products. A product with no usable price in the document's
 * region is shown but disabled with a "price required" hint instead of
 * being hidden, so a manager can see it exists and knows why it can't be
 * added yet. Collapses back to a single "+ Add item" button after a
 * successful add (or on cancel).
 */
export function AddItemPicker({
  documentId,
  catalog,
  addItemAction,
}: {
  documentId: string;
  catalog: ItemPickerSeries[];
  addItemAction: (documentId: string, productCode: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [seriesCode, setSeriesCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const activeSeries = catalog.find((s) => s.code === seriesCode) ?? null;

  function close() {
    setOpen(false);
    setSeriesCode(null);
    setError(null);
  }

  function handleAdd(productCode: string) {
    setError(null);
    startTransition(async () => {
      const result = await addItemAction(documentId, productCode);
      if (result?.error) {
        setError(result.error);
        return;
      }
      close();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="w-fit">
        <Plus className="size-4" data-icon="inline-start" />
        Add item
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        {activeSeries ? (
          <button
            type="button"
            onClick={() => setSeriesCode(null)}
            className="flex items-center gap-1 text-sm font-medium text-brand-dark"
          >
            <ChevronLeft className="size-4" />
            {activeSeries.name}
          </button>
        ) : (
          <span className="text-sm font-medium text-brand-dark">Choose a series</span>
        )}
        <Button type="button" variant="ghost" size="icon-sm" onClick={close} aria-label="Cancel">
          <X className="size-4" />
        </Button>
      </div>

      <div className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">
        {!activeSeries
          ? catalog.map((series) => (
              <button
                key={series.code}
                type="button"
                onClick={() => setSeriesCode(series.code)}
                className="flex items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-white"
              >
                <span>{series.name}</span>
                <span className="text-xs text-muted-foreground">
                  {series.products.length} {series.products.length === 1 ? "product" : "products"}
                </span>
              </button>
            ))
          : activeSeries.products.map((product) => (
              <button
                key={product.code}
                type="button"
                disabled={!product.priced || pending}
                onClick={() => handleAdd(product.code)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-white",
                  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                )}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="font-mono text-xs text-brand-dark">{product.code}</span>
                  <span className="truncate">{product.name}</span>
                </span>
                {!product.priced && (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                    price required
                  </span>
                )}
              </button>
            ))}
        {activeSeries && activeSeries.products.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">No products in this series.</p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
