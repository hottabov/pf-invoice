import { formatMoney } from "@/lib/format";
import { SectionCard, EmptyState } from "@/components/ui-kit";
import { RemoveItemButton } from "@/components/builder/remove-item-button";
import { AddItemPicker } from "@/components/builder/add-item-picker";
import { ItemOptionsEditor } from "@/components/builder/item-options-editor";
import { ItemDiscountField } from "@/components/builder/item-discount-field";
import { PackageSearch } from "lucide-react";
import type { ActionResult } from "@/lib/actions/documents";
import type { BuilderItem, CompatibleOption, ItemPickerSeries } from "@/lib/queries/documents";
import type { OptionSelectionInput } from "@/lib/validation/documents";

/**
 * The builder's "Items" section: one card per DocumentItem (product
 * snapshot, its option chips/editor, its discount field and its computed
 * total) plus the "Add item" picker. `compatibleOptionsByItemKey` is
 * preloaded once per distinct (productId, seriesId) pair on the page (see
 * getDocumentForBuilder + listCompatibleOptions) and looked up per item by
 * its `productId` (falling back to `series:<seriesId>` in the defensive
 * case of an item with no resolvable product — see `BuilderItem`) rather
 * than re-fetched per card.
 */
export function ItemsSection({
  documentId,
  items,
  currency,
  catalog,
  compatibleOptionsByItemKey,
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
  compatibleOptionsByItemKey: Record<string, CompatibleOption[]>;
  removeItemAction: (itemId: string) => Promise<ActionResult>;
  addItemAction: (documentId: string, productCode: string) => Promise<ActionResult>;
  setItemOptionsAction: (itemId: string, selections: OptionSelectionInput[]) => Promise<ActionResult>;
  setItemDiscountAction: (itemId: string, formData: FormData) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  return (
    <SectionCard title="Items">
      {items.length === 0 ? (
        <EmptyState icon={PackageSearch} title="No items yet" description="Add one below to get started." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const compatKey = item.productId ?? (item.seriesId ? `series:${item.seriesId}` : null);
            return (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="size-12 shrink-0 rounded-lg border border-slate-200 object-contain"
                      />
                    ) : null}
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-brand-dark">{item.name}</span>
                      <span className="font-mono text-xs text-slate-500">{item.code}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    <span className="pt-2 text-sm font-medium tabular-nums text-brand-dark">
                      {formatMoney(item.total, currency)}
                    </span>
                    {!readOnly && (
                      <RemoveItemButton
                        action={removeItemAction.bind(null, item.id)}
                        itemName={item.name}
                      />
                    )}
                  </div>
                </div>

                <ItemOptionsEditor
                  itemId={item.id}
                  currentLines={item.lines
                    .filter((line) => line.kind === "OPTION")
                    .map((line) => ({ code: line.code, qty: line.qty, attributes: line.attributes }))}
                  compatibleOptions={compatKey ? (compatibleOptionsByItemKey[compatKey] ?? []) : []}
                  currency={currency}
                  setOptionsAction={setItemOptionsAction}
                  readOnly={readOnly}
                />

                <div className="mt-3 border-t border-slate-100 pt-3">
                  <ItemDiscountField
                    itemId={item.id}
                    discountPct={item.discountPct}
                    maxDiscountPct={item.maxDiscountPct}
                    setDiscountAction={setItemDiscountAction}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <div className="mt-4">
          <AddItemPicker documentId={documentId} catalog={catalog} addItemAction={addItemAction} />
        </div>
      )}
    </SectionCard>
  );
}
