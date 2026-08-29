"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/catalog/field";
import { formatMoney } from "@/lib/format";
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
 * panel listing every option compatible with the item's series
 * (series-level `OptionCompatibility` — preloaded via
 * `listCompatibleOptions`). Checking an option reveals its qty stepper and
 * (when it carries an `attributeSchema`) its attribute inputs; an unpriced
 * option is shown but its checkbox is disabled. "Save options" sends the
 * *entire* selection set to `setItemOptions`, which replaces the item's
 * OPTION lines as a whole (see actions/documents.ts) — there's no partial
 * add/remove here.
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const chips = currentLines.filter((line): line is CurrentLine & { code: string } => Boolean(line.code));

  // Re-sync from the server-confirmed lines only at the moment the panel
  // opens — while it's open, the user's own edits are the source of truth
  // and shouldn't be clobbered by a stale prop from an unrelated re-render.
  function openPanel() {
    setSelected(selectionsFromLines(currentLines));
    setError(null);
    setOpen(true);
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
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((line, index) => (
          <span
            key={`${line.code}-${index}`}
            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          >
            {line.code} ×{line.qty}
          </span>
        ))}
        {chips.length === 0 && readOnly ? (
          <span className="text-xs text-muted-foreground">No options</span>
        ) : null}
        {!readOnly && (
          <button
            type="button"
            onClick={() => (open ? setOpen(false) : openPanel())}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            Edit options
            {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        )}
      </div>

      {open && !readOnly ? (
        <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3">
          {compatibleOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No compatible options for this series.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {compatibleOptions.map((option) => {
                const state = selected.get(option.code);
                const checked = Boolean(state);
                const priced = Boolean(option.price && !option.price.needsReview);
                const attributeFields = parseAttributeFields(option.attributeSchema);

                return (
                  <div key={option.id} className="rounded-md border border-border bg-white p-2">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!priced}
                        onChange={() => toggle(option.code)}
                        className="mt-0.5 size-4 shrink-0 rounded border-border accent-brand"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-xs text-brand-dark">{option.code}</span>
                          <span className="text-sm text-foreground">{option.name}</span>
                        </span>
                        {priced ? (
                          <span className="text-xs text-muted-foreground">
                            {formatMoney(option.price!.amount, currency)}
                          </span>
                        ) : (
                          <span className="w-fit rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                            price required
                          </span>
                        )}
                      </span>
                    </label>

                    {checked ? (
                      <div className="mt-2 flex flex-wrap gap-3 pl-6">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          Qty
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={999}
                            value={state!.qty}
                            onChange={(e) => setQty(option.code, Math.max(1, Number(e.target.value) || 1))}
                            className={`${inputClass} h-8 w-20`}
                          />
                        </label>
                        {attributeFields.map((field) => (
                          <label
                            key={field.key}
                            className="flex items-center gap-2 text-xs text-muted-foreground"
                          >
                            {field.label}
                            <input
                              type={field.type === "number" ? "number" : "text"}
                              inputMode={field.type === "number" ? "decimal" : undefined}
                              value={state!.attributes[field.key] ?? ""}
                              onChange={(e) => setAttribute(option.code, field.key, e.target.value)}
                              className={`${inputClass} h-8 w-28`}
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

          {error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save options"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
