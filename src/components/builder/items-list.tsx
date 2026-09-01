"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { RemoveItemButton } from "@/components/builder/remove-item-button";
import { ItemOptionsEditor } from "@/components/builder/item-options-editor";
import { ItemDiscountField } from "@/components/builder/item-discount-field";
import { ItemShowImageToggle } from "@/components/builder/item-show-image-toggle";
import { ProductionSpecEditor } from "@/components/builder/production-spec-editor";
import { useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { resolveForm } from "@/lib/production-forms/resolve";
import type { ActionResult } from "@/lib/actions/documents";
import type { BuilderItem, CompatibleOption } from "@/lib/queries/documents";
import type { OptionSelectionInput } from "@/lib/validation/documents";

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const copy = list.slice();
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

/**
 * The builder's item cards, reorderable when the document is a DRAFT.
 * `items` is the server's own `sortOrder asc` order (see
 * `getDocumentForBuilder`) — the single source of truth. Reordering is
 * optimistic via `useOptimistic`: a drag-drop or Up/Down click updates the
 * displayed order immediately, then `reorderItemsAction` persists it. If the
 * action fails, `items` itself never changed, so the optimistic order
 * reverts automatically once the transition settles; we additionally toast
 * the error and force a `router.refresh()` so a client whose local item list
 * had actually gone stale (e.g. another tab already reordered/removed items)
 * re-syncs with the server instead of re-showing a rejected order.
 *
 * Two reorder affordances, both scoped to `!readOnly`:
 * - A grip handle (HTML5 drag & drop) for pointer/desktop use — dragging the
 *   handle drags the whole card (via `setDragImage`) onto another card to
 *   swap positions.
 * - Up/Down icon buttons, always visible (not just on touch): the
 *   accessible fallback for touch devices (native HTML5 DnD doesn't work on
 *   mobile browsers) and for keyboard/screen-reader users, since the drag
 *   handle itself isn't keyboard-operable.
 *
 * Each card is independently collapsible (owner: cards get huge once an
 * item has many options, and collapsed cards are easier to drag-reorder).
 * Collapse state lives in `collapsedByItemId`, a `Map<itemId, boolean>` kept
 * in this component (not per-card local state) so it survives reordering —
 * keyed by `item.id` rather than array index, a reorder never shuffles which
 * card is collapsed. Absent from the map means expanded (the default for a
 * newly added item). The header row (drag handle, name, code, options-count
 * chip, item total, up/down, remove, chevron) is always visible and — apart
 * from its own interactive controls, which stop propagation — clicking
 * anywhere on it toggles the card; the body (options editor, discount,
 * show-image toggle) collapses via a `grid-template-rows` transition so it
 * animates smoothly without knowing its own height up front.
 */
export function ItemsList({
  documentId,
  items,
  currency,
  compatibleOptionsByItemKey,
  removeItemAction,
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
  compatibleOptionsByItemKey: Record<string, CompatibleOption[]>;
  removeItemAction: (itemId: string) => Promise<ActionResult>;
  setItemOptionsAction: (itemId: string, selections: OptionSelectionInput[]) => Promise<ActionResult>;
  setItemDiscountAction: (itemId: string, formData: FormData) => Promise<ActionResult>;
  setItemShowImageAction: (itemId: string, show: boolean) => Promise<ActionResult>;
  reorderItemsAction: (documentId: string, orderedItemIds: string[]) => Promise<ActionResult>;
  showOptionIcons?: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [optimisticItems, setOptimisticItems] = useOptimistic(
    items,
    (_state: BuilderItem[], newOrder: BuilderItem[]) => newOrder
  );
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const cardNodes = useRef(new Map<string, HTMLDivElement>());
  const [collapsedByItemId, setCollapsedByItemId] = useState<Map<string, boolean>>(new Map());

  function isCollapsed(itemId: string) {
    return collapsedByItemId.get(itemId) ?? false;
  }

  function toggleCollapsed(itemId: string) {
    setCollapsedByItemId((prev) => {
      const next = new Map(prev);
      next.set(itemId, !(prev.get(itemId) ?? false));
      return next;
    });
  }

  function collapseAll() {
    setCollapsedByItemId(new Map(optimisticItems.map((item) => [item.id, true])));
  }

  function expandAll() {
    setCollapsedByItemId(new Map());
  }

  function commitOrder(newOrder: BuilderItem[]) {
    startTransition(async () => {
      setOptimisticItems(newOrder);
      const result = await reorderItemsAction(
        documentId,
        newOrder.map((item) => item.id)
      );
      if (result?.error) {
        toast.error(result.error);
        router.refresh();
      }
    });
  }

  function moveBy(index: number, delta: number) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= optimisticItems.length) return;
    commitOrder(arrayMove(optimisticItems, index, targetIndex));
  }

  // The line chip inside ProductionSpecEditor is noise on a single-machine
  // quote (nothing to disambiguate), so it's only worth showing once the
  // document actually holds two or more items a production form recognizes.
  const machineCount = optimisticItems.filter((item) => resolveForm(item.code) !== null).length;

  function handleDrop(targetId: string) {
    setDropTargetId(null);
    const sourceId = draggingId;
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;
    const fromIndex = optimisticItems.findIndex((item) => item.id === sourceId);
    const toIndex = optimisticItems.findIndex((item) => item.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    commitOrder(arrayMove(optimisticItems, fromIndex, toIndex));
  }

  return (
    <div className="flex flex-col gap-3">
      {optimisticItems.length > 1 ? (
        <div className="flex justify-end gap-3 text-xs font-medium text-slate-500">
          <button
            type="button"
            onClick={collapseAll}
            className="focus-ring rounded transition-colors hover:text-brand"
          >
            Collapse all
          </button>
          <span aria-hidden="true" className="text-slate-300">
            |
          </span>
          <button
            type="button"
            onClick={expandAll}
            className="focus-ring rounded transition-colors hover:text-brand"
          >
            Expand all
          </button>
        </div>
      ) : null}

      {optimisticItems.map((item, index) => {
        const compatKey = item.productId ?? (item.seriesId ? `series:${item.seriesId}` : null);
        const isDragging = draggingId === item.id;
        const isDropTarget = dropTargetId === item.id && draggingId !== item.id;
        const collapsed = isCollapsed(item.id);
        const optionCount = item.lines.filter((line) => line.kind === "OPTION").length;

        return (
          <div
            key={item.id}
            ref={(node) => {
              if (node) cardNodes.current.set(item.id, node);
              else cardNodes.current.delete(item.id);
            }}
            onDragOver={(event) => {
              if (!draggingId) return;
              event.preventDefault();
              if (dropTargetId !== item.id) setDropTargetId(item.id);
            }}
            onDragLeave={() => {
              setDropTargetId((current) => (current === item.id ? null : current));
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleDrop(item.id);
            }}
            className={cn(
              "rounded-xl border border-slate-200 p-3 transition-[opacity,box-shadow] duration-150 motion-reduce:transition-none sm:p-4",
              isDragging && "opacity-50",
              isDropTarget && "ring-2 ring-brand"
            )}
          >
            {/* Header: always visible, clicking anywhere on it (other than
                the drag/reorder controls and remove button, which stop
                propagation) toggles the card's collapsed state. The chevron
                button is the keyboard/screen-reader-accessible affordance —
                it carries no handler of its own and relies on its native
                click event bubbling up to this row. Reorder controls (up/down)
                are inline on the right with compact 36px visual / 44px hit area. */}
            <div
              onClick={() => toggleCollapsed(item.id)}
              className="flex cursor-pointer select-none items-start justify-between gap-3"
            >
              <div className="flex min-w-0 items-start gap-2">
                {!readOnly && (
                  <div
                    onClick={(event) => event.stopPropagation()}
                    className="flex shrink-0 items-center"
                  >
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", item.id);
                        const node = cardNodes.current.get(item.id);
                        if (node) event.dataTransfer.setDragImage(node, 20, 20);
                        setDraggingId(item.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDropTargetId(null);
                      }}
                      aria-label={`Reorder ${item.name}`}
                      className="focus-ring flex size-11 cursor-grab items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 active:cursor-grabbing"
                    >
                      <GripVertical className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="size-12 shrink-0 rounded-lg border border-slate-200 object-contain"
                  />
                ) : null}
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-brand-dark">{item.name}</span>
                    <span className="font-mono text-xs text-slate-500">{item.code}</span>
                  </div>
                  {optionCount > 0 ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {optionCount} option{optionCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <span className="pt-2 text-sm font-medium tabular-nums text-brand-dark">
                  {formatMoney(item.total, currency)}
                </span>
                {!readOnly && (
                  <>
                    <div onClick={(event) => event.stopPropagation()} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moveBy(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${item.name} up`}
                        className="focus-ring flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:pointer-events-none disabled:opacity-30 -m-1 p-1"
                      >
                        <ChevronUp className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBy(index, 1)}
                        disabled={index === optimisticItems.length - 1}
                        aria-label={`Move ${item.name} down`}
                        className="focus-ring flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:pointer-events-none disabled:opacity-30 -m-1 p-1"
                      >
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                    <span onClick={(event) => event.stopPropagation()}>
                      <RemoveItemButton action={removeItemAction.bind(null, item.id)} itemName={item.name} />
                    </span>
                  </>
                )}
                <button
                  type="button"
                  aria-label={collapsed ? `Expand ${item.name}` : `Collapse ${item.name}`}
                  aria-expanded={!collapsed}
                  className="focus-ring flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform duration-150 motion-reduce:transition-none",
                      collapsed && "-rotate-90"
                    )}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>

            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-150 ease-in-out motion-reduce:transition-none",
                collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
              )}
            >
              <div className="overflow-hidden">
                <ItemOptionsEditor
                  itemId={item.id}
                  currentLines={item.lines
                    .filter((line) => line.kind === "OPTION")
                    .map((line) => ({ code: line.code, qty: line.qty, attributes: line.attributes }))}
                  compatibleOptions={compatKey ? (compatibleOptionsByItemKey[compatKey] ?? []) : []}
                  currency={currency}
                  setOptionsAction={setItemOptionsAction}
                  showOptionIcons={showOptionIcons}
                  readOnly={readOnly}
                />

                <ProductionSpecEditor
                  itemId={item.id}
                  itemCode={item.code}
                  lineGroup={item.lineGroup}
                  spec={(item.productionSpec ?? {}) as Record<string, unknown>}
                  optionQtys={item.lines
                    .filter((line): line is typeof line & { code: string } => line.kind === "OPTION" && Boolean(line.code))
                    .map((line) => ({ code: line.code, qty: line.qty }))}
                  showLineChip={machineCount > 1}
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <ItemDiscountField
                    itemId={item.id}
                    discountPct={item.discountPct}
                    maxDiscountPct={item.maxDiscountPct}
                    setDiscountAction={setItemDiscountAction}
                    readOnly={readOnly}
                  />
                  {!readOnly && item.productHasImage ? (
                    <ItemShowImageToggle
                      itemId={item.id}
                      showImage={item.showImage}
                      setShowImageAction={setItemShowImageAction}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
