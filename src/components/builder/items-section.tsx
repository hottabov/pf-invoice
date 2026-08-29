import { formatMoney } from "@/lib/format";
import { RemoveItemButton } from "@/components/builder/remove-item-button";
import { AddItemPicker } from "@/components/builder/add-item-picker";
import type { ActionResult } from "@/lib/actions/documents";
import type { BuilderItem, ItemPickerSeries } from "@/lib/queries/documents";

/**
 * The builder's "Items" section: one card per DocumentItem (product
 * snapshot + its option lines) plus the "Add item" picker. Option editing,
 * per-item discounts and extra lines are Task D — each item card shows
 * placeholders for them so the layout doesn't shift once those land.
 */
export function ItemsSection({
  documentId,
  items,
  currency,
  catalog,
  removeItemAction,
  addItemAction,
  readOnly = false,
}: {
  documentId: string;
  items: BuilderItem[];
  currency: string;
  catalog: ItemPickerSeries[];
  removeItemAction: (itemId: string) => Promise<ActionResult>;
  addItemAction: (documentId: string, productCode: string) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-white p-4 sm:p-6">
      <h2 className="text-sm font-semibold text-brand-dark">Items</h2>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No items yet.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="size-12 shrink-0 rounded-md border border-border object-contain"
                    />
                  ) : null}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-brand-dark">{item.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      options: {item.lines.length}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm font-medium text-brand-dark">
                    {formatMoney(item.unitPrice, currency)}
                  </span>
                  {!readOnly && (
                    <RemoveItemButton
                      action={removeItemAction.bind(null, item.id)}
                      label={`Remove ${item.name}`}
                    />
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Options & discounts — next task.</p>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="mt-4">
          <AddItemPicker documentId={documentId} catalog={catalog} addItemAction={addItemAction} />
        </div>
      )}
    </section>
  );
}
