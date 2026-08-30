"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { RemoveItemButton } from "@/components/builder/remove-item-button";
import { ItemOptionsEditor } from "@/components/builder/item-options-editor";
import { ItemDiscountField } from "@/components/builder/item-discount-field";
import { ItemShowImageToggle } from "@/components/builder/item-show-image-toggle";
import { useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
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
      {optimisticItems.map((item, index) => {
        const compatKey = item.productId ?? (item.seriesId ? `series:${item.seriesId}` : null);
        const isDragging = draggingId === item.id;
        const isDropTarget = dropTargetId === item.id && draggingId !== item.id;

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
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                {!readOnly && (
                  <div className="flex shrink-0 flex-col items-center gap-0.5">
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
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveBy(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${item.name} up`}
                        className="focus-ring flex size-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ChevronUp className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBy(index, 1)}
                        disabled={index === optimisticItems.length - 1}
                        aria-label={`Move ${item.name} down`}
                        className="focus-ring flex size-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </button>
                    </div>
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
                  <RemoveItemButton action={removeItemAction.bind(null, item.id)} itemName={item.name} />
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
        );
      })}
    </div>
  );
}
