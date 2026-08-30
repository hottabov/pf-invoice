"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldInputClass } from "@/components/ui-kit";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";
import type { CompatibleOption } from "@/lib/queries/documents";
import type { OptionSelectionInput } from "@/lib/validation/documents";

type AttributeField = { key: string; label: string; type: "number" | "text" };

/**
 * Tolerates a malformed/absent `Option.attributeSchema` (admin-entered raw
 * JSON — see catalog.ts's `attributeSchemaSchema`): only entries that are
 * plain objects with a string `key`/`label` and a recognized `type` become
 * an input; anything else (not an array, wrong shape, unknown type) is
 * silently skipped rather than crashing the editor.
 */
function parseAttributeFields(schema: unknown): AttributeField[] {
  if (!Array.isArray(schema)) return [];
  const fields: AttributeField[] = [];
  for (const entry of schema) {
    if (!entry || typeof entry !== "object") continue;
    const { key, label, type } = entry as Record<string, unknown>;
    if (typeof key !== "string" || key.trim() === "") continue;
    if (typeof label !== "string" || label.trim() === "") continue;
    if (type !== "number" && type !== "text") continue;
    fields.push({ key, label, type });
  }
  return fields;
}

type CurrentLine = {
  code: string | null;
  qty: number;
  attributes: Record<string, string | number> | null;
};

type SelectionState = { qty: number; attributes: Record<string, string> };

function selectionsFromLines(lines: CurrentLine[]): Map<string, SelectionState> {
  const map = new Map<string, SelectionState>();
  for (const line of lines) {
    if (!line.code) continue;
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(line.attributes ?? {})) {
      attributes[key] = String(value);
    }
    map.set(line.code, { qty: line.qty, attributes });
  }
  return map;
}

/**
 * Per-item options editor: a row of "code ×qty" chips summarizing the
 * item's current OPTION lines, plus an "Edit options" toggle that opens a
 * panel listing every option compatible with the item (series- and/or
 * product-level `OptionCompatibility` — preloaded via
 * `listCompatibleOptions`). Checking an option reveals its qty stepper and
 * (when it carries an `attributeSchema`) its attribute inputs; an unpriced
 * option is shown but its checkbox is disabled. "Save options" sends the
 * *entire* selection set to `setItemOptions`, which replaces the item's
 * OPTION lines as a whole (see actions/documents.ts) — there's no partial
 * add/remove here.
 *
 * The panel also has a search box (client-side filter on code + name),
 * "Select all" / "Clear" buttons, and a "N of M selected" count badge.
 * "Select all" adds every currently-*filtered* and priced option to the
 * selection; "Clear" resets the whole selection (not just the filtered
 * subset) — a full reset is one click away regardless of search state.
 * Options are always rendered in their original catalog order (filtered by
 * search only) — selecting/deselecting never reorders the list. The panel
 * itself is one scrolling column capped at 70dvh with the Save/Cancel bar pinned
 * (`sticky bottom-0`) to its own bottom, so it stays reachable even when a
 * series has many options — including on a phone, the primary device this
 * builder targets.
 */
export function ItemOptionsEditor({
  itemId,
  currentLines,
  compatibleOptions,
  currency,
  setOptionsAction,
  readOnly = false,
}: {
  itemId: string;
  currentLines: CurrentLine[];
  compatibleOptions: CompatibleOption[];
  currency: string;
  setOptionsAction: (itemId: string, selections: OptionSelectionInput[]) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Map<string, SelectionState>>(() =>
    selectionsFromLines(currentLines)
  );
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const chips = currentLines.filter((line): line is CurrentLine & { code: string } => Boolean(line.code));

  // Re-sync from the server-confirmed lines only at the moment the panel
  // opens — while it's open, the user's own edits are the source of truth
  // and shouldn't be clobbered by a stale prop from an unrelated re-render.
  function openPanel() {
    setSelected(selectionsFromLines(currentLines));
    setSearch("");
    setError(null);
    setOpen(true);
  }

  const query = search.trim().toLowerCase();
  const filteredOptions = query
    ? compatibleOptions.filter(
        (option) =>
          option.code.toLowerCase().includes(query) || option.name.toLowerCase().includes(query)
      )
    : compatibleOptions;

  // Always rendered in the original catalog order — no selected-first
  // sorting, so the list never reshuffles as the user checks/unchecks
  // options.
  const displayOptions = filteredOptions;

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const option of filteredOptions) {
        if (next.has(option.code)) continue;
        const priced = Boolean(option.price && !option.price.needsReview);
        if (!priced) continue;
        next.set(option.code, { qty: 1, attributes: {} });
      }
      return next;
    });
  }

  function clearAll() {
    setSelected(new Map());
  }

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(code)) next.delete(code);
      else next.set(code, { qty: 1, attributes: {} });
      return next;
    });
  }

  function setQty(code: string, qty: number) {
    setSelected((prev) => {
      const current = prev.get(code);
      if (!current) return prev;
      const next = new Map(prev);
      next.set(code, { ...current, qty });
      return next;
    });
  }

  function setAttribute(code: string, key: string, value: string) {
    setSelected((prev) => {
      const current = prev.get(code);
      if (!current) return prev;
      const next = new Map(prev);
      next.set(code, { ...current, attributes: { ...current.attributes, [key]: value } });
      return next;
    });
  }

  function save() {
    setError(null);
    const selections: OptionSelectionInput[] = compatibleOptions
      .filter((option) => selected.has(option.code))
      .map((option) => {
        const state = selected.get(option.code)!;
        const fields = parseAttributeFields(option.attributeSchema);
        const attributes: Record<string, string | number> = {};
        for (const field of fields) {
          const raw = state.attributes[field.key];
          if (raw === undefined || raw === "") continue;
          if (field.type === "number") {
            const num = Number(raw);
            attributes[field.key] = Number.isFinite(num) ? num : raw;
          } else {
            attributes[field.key] = raw;
          }
        }
        return {
          optionCode: option.code,
          qty: state.qty,
          attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
        };
      });

    startTransition(async () => {
      const result = await setOptionsAction(itemId, selections);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((line, index) => (
          <span
            key={`${line.code}-${index}`}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
          >
            {line.code} ×{line.qty}
          </span>
        ))}
        {chips.length === 0 && readOnly ? (
          <span className="text-xs text-slate-500">No options</span>
        ) : null}
        {!readOnly && (
          <button
            type="button"
            onClick={() => (open ? setOpen(false) : openPanel())}
            className="focus-ring inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-medium text-brand hover:underline"
          >
            Edit options
            {open ? (
              <ChevronUp className="size-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {open && !readOnly ? (
        <div className="mt-2 flex max-h-[70dvh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex-1 overflow-y-auto p-3">
            {compatibleOptions.length === 0 ? (
              <p className="text-sm text-slate-500">No compatible options for this item.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search options…"
                    aria-label="Search options"
                    className={cn(fieldInputClass, "h-11 min-w-[10rem] flex-1 sm:h-9")}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={selectAllFiltered}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
                    Clear
                  </Button>
                  <span className="text-xs text-slate-500">
                    {selected.size} of {compatibleOptions.length} selected
                  </span>
                </div>

                {displayOptions.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No options match &ldquo;{search}&rdquo;.</p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    {displayOptions.map((option) => {
                      const state = selected.get(option.code);
                      const checked = Boolean(state);
                      const priced = Boolean(option.price && !option.price.needsReview);
                      const attributeFields = parseAttributeFields(option.attributeSchema);

                      return (
                        <div
                          key={option.id}
                          className="rounded-lg border border-slate-200 bg-white p-2.5"
                        >
                          <label className="flex min-h-12 items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!priced}
                              onChange={() => toggle(option.code)}
                              className="mt-0.5 size-5 shrink-0 rounded border-slate-300 accent-brand"
                            />
                            <span className="flex min-w-0 flex-1 flex-col justify-center">
                              <span className="flex flex-wrap items-baseline gap-2">
                                <span className="font-mono text-xs text-brand-dark">{option.code}</span>
                                <span className="text-sm text-slate-700">{option.name}</span>
                              </span>
                              {priced ? (
                                <span className="text-xs text-slate-500">
                                  {formatMoney(option.price!.amount, currency)}
                                </span>
                              ) : (
                                <span className="mt-0.5 w-fit rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                  price required
                                </span>
                              )}
                            </span>
                          </label>

                          {checked ? (
                            <div className="mt-2 flex flex-wrap items-center gap-3 pl-[1.875rem]">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-500">Qty</span>
                                {/* Visual stepper stays a compact 36px square (dense per-option
                                    row); the real tap target is the full 44px button around it —
                                    an invisible hit-area expansion, same idea as the toast close
                                    button's negative-margin trick elsewhere in this codebase. */}
                                <button
                                  type="button"
                                  aria-label={`Decrease ${option.name} quantity`}
                                  disabled={state!.qty <= 1}
                                  onClick={() => setQty(option.code, Math.max(1, state!.qty - 1))}
                                  className="group focus-ring flex size-11 shrink-0 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <span
                                    aria-hidden="true"
                                    className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors md:group-hover:bg-slate-50"
                                  >
                                    <Minus className="size-3.5" />
                                  </span>
                                </button>
                                {/* Wrapping <label> (native click-forwarding to the nested
                                    control, no JS needed) expands the tap target to 44px tall
                                    without growing the visible 36px input box. */}
                                <label className="flex size-11 shrink-0 items-center justify-center">
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={999}
                                    aria-label={`${option.name} quantity`}
                                    value={state!.qty}
                                    onChange={(e) =>
                                      setQty(option.code, Math.max(1, Number(e.target.value) || 1))
                                    }
                                    className={cn(fieldInputClass, "h-9 w-14 text-center")}
                                  />
                                </label>
                                <button
                                  type="button"
                                  aria-label={`Increase ${option.name} quantity`}
                                  onClick={() => setQty(option.code, Math.min(999, state!.qty + 1))}
                                  className="group focus-ring flex size-11 shrink-0 items-center justify-center rounded-lg"
                                >
                                  <span
                                    aria-hidden="true"
                                    className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors md:group-hover:bg-slate-50"
                                  >
                                    <Plus className="size-3.5" />
                                  </span>
                                </button>
                              </div>
                              {attributeFields.map((field) => (
                                <label
                                  key={field.key}
                                  className="flex items-center gap-2 text-xs text-slate-500"
                                >
                                  {field.label}
                                  <input
                                    type={field.type === "number" ? "number" : "text"}
                                    inputMode={field.type === "number" ? "decimal" : undefined}
                                    value={state!.attributes[field.key] ?? ""}
                                    onChange={(e) => setAttribute(option.code, field.key, e.target.value)}
                                    className={cn(fieldInputClass, "h-11 w-28 sm:h-9")}
                                  />
                                </label>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-white p-3">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Button type="button" onClick={save} disabled={pending} className="h-10 bg-brand text-white hover:bg-brand/90">
                {pending ? "Saving…" : "Save options"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="h-10"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
