import { formatMoney } from "@/lib/format";
import { RemoveItemButton } from "@/components/builder/remove-item-button";
import { AddItemPicker } from "@/components/builder/add-item-picker";
import { ItemOptionsEditor } from "@/components/builder/item-options-editor";
import { ItemDiscountField } from "@/components/builder/item-discount-field";
import type { ActionResult } from "@/lib/actions/documents";
import type { BuilderItem, CompatibleOption, ItemPickerSeries } from "@/lib/queries/documents";
import type { OptionSelectionInput } from "@/lib/validation/documents";

/**
 * The builder's "Items" section: one card per DocumentItem (product
 * snapshot, its option chips/editor, its discount field and its computed
 * total) plus the "Add item" picker. `compatibleOptionsBySeriesId` is
 * preloaded once per distinct series on the page (see
 * getDocumentForBuilder + listCompatibleOptions) and looked up per item by
 * its `seriesId` rather than re-fetched per card.
 */
export function ItemsSection({
  documentId,
  items,
  currency,
  catalog,
  compatibleOptionsBySeriesId,
  removeItemAction,
  addItemAction,
  setItemOptionsAction,
  setItemDiscountAction,
  readOnly = false,
}: {
  documentId: string;
  items: BuilderItem[];
  currency: string;
  catalog: ItemPickerSeries[];
  compatibleOptionsBySeriesId: Record<string, CompatibleOption[]>;
  removeItemAction: (itemId: string) => Promise<ActionResult>;
  addItemAction: (documentId: string, productCode: string) => Promise<ActionResult>;
  setItemOptionsAction: (itemId: string, selections: OptionSelectionInput[]) => Promise<ActionResult>;
  setItemDiscountAction: (itemId: string, formData: FormData) => Promise<ActionResult>;
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
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm font-medium text-brand-dark">
                    {formatMoney(item.total, currency)}
                  </span>
                  {!readOnly && (
                    <RemoveItemButton
                      action={removeItemAction.bind(null, item.id)}
                      label={`Remove ${item.name}`}
                    />
                  )}
                </div>
              </div>

              <ItemOptionsEditor
                itemId={item.id}
                currentLines={item.lines
                  .filter((line) => line.kind === "OPTION")
                  .map((line) => ({ code: line.code, qty: line.qty, attributes: line.attributes }))}
                compatibleOptions={item.seriesId ? (compatibleOptionsBySeriesId[item.seriesId] ?? []) : []}
                currency={currency}
                setOptionsAction={setItemOptionsAction}
                readOnly={readOnly}
              />

              <div className="mt-2">
                <ItemDiscountField
                  itemId={item.id}
                  discountPct={item.discountPct}
                  maxDiscountPct={item.maxDiscountPct}
                  setDiscountAction={setItemDiscountAction}
                  readOnly={readOnly}
                />
              </div>
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
