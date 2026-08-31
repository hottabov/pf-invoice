import { SectionCard, EmptyState } from "@/components/ui-kit";
import { AddItemPicker } from "@/components/builder/add-item-picker";
import { ItemsList } from "@/components/builder/items-list";
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
  setItemShowImageAction,
  reorderItemsAction,
  showOptionIcons = true,
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
  setItemShowImageAction: (itemId: string, show: boolean) => Promise<ActionResult>;
  reorderItemsAction: (documentId: string, orderedItemIds: string[]) => Promise<ActionResult>;
  /** "ui.showOptionIcons" app setting, read server-side by the builder page
   * and threaded down to `ItemOptionsEditor` — see its own doc comment. */
  showOptionIcons?: boolean;
  readOnly?: boolean;
}) {
  return (
    <SectionCard title="Items">
      {items.length === 0 ? (
        <EmptyState icon={PackageSearch} title="No items yet" description="Add one below to get started." />
      ) : (
        <ItemsList
          documentId={documentId}
          items={items}
          currency={currency}
          compatibleOptionsByItemKey={compatibleOptionsByItemKey}
          removeItemAction={removeItemAction}
          setItemOptionsAction={setItemOptionsAction}
          setItemDiscountAction={setItemDiscountAction}
          setItemShowImageAction={setItemShowImageAction}
          reorderItemsAction={reorderItemsAction}
          showOptionIcons={showOptionIcons}
          readOnly={readOnly}
        />
      )}

      {!readOnly && (
        <div className="mt-4">
          <AddItemPicker documentId={documentId} catalog={catalog} addItemAction={addItemAction} />
        </div>
      )}
    </SectionCard>
  );
}
