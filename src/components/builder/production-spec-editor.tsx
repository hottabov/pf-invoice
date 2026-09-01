"use client";

import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { FieldRow, fieldInputClass, useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { setItemLineGroup, setProductionSpec } from "@/lib/actions/production";
import { resolveForm } from "@/lib/production-forms/resolve";

type Section = { lengthM: number; surface: "static" | "conveyor" };

/**
 * Replaces one table section, dropping any trailing section left with no
 * length. The form prints three section rows and the schema caps the array
 * at three, so a cleared section must shrink the array rather than leave a
 * zero-length hole the renderer would tick a surface box for.
 */
function writeSection(sections: Section[], index: number, next: Section): Section[] {
  const copy = [...sections];
  copy[index] = next;
  while (copy.length > 0 && !copy[copy.length - 1]?.lengthM) copy.pop();
  return copy.filter(Boolean);
}

const SCREEN_SIDES = ["+Y", "-Y"] as const;
const KNIFE_SIZES = ["1.5x5.0", "1.5x7.0", "2.0x7.0"] as const;
const VOLTAGES = ["220V", "400V", "415V", "480V"] as const;

const checkboxClass = "size-5 shrink-0 rounded border-slate-300 accent-brand";

type Props = {
  itemId: string;
  itemCode: string;
  lineGroup: number;
  spec: Record<string, unknown>;
  /** Show the line chip only when the document holds more than one machine
   * (see `resolveForm(item.code) !== null` count in ItemsList) — on a
   * single-machine quote every item is implicitly "line 1" and the selector
   * is pure noise. */
  showLineChip: boolean;
};

/**
 * The per-item production spec editor: the machine questions the price list
 * doesn't cover (operator screen side, knife size, table sections, etc — see
 * `src/lib/production-forms`), collapsed behind a disclosure button that
 * surfaces how many required fields are still unanswered. Returns `null` for
 * an item `resolveForm` doesn't recognize (software/service rows), so it's
 * safe to mount unconditionally from `ItemsList`.
 *
 * Every field writes through `setProductionSpec` immediately (select
 * `onChange`, text/number inputs `onBlur` — no separate Save button, mirrors
 * `ItemDiscountField`'s autosave-on-change feel without the debounce, since
 * these are discrete choices rather than free-typed text). `ui` (operator
 * screen side) is the one field with a side effect beyond this item: the
 * server propagates it to every item sharing this item's `lineGroup` (a
 * cutter and its EasyLoader/FabricPro must agree, or the physical install is
 * wrong) — when that happens, `setProductionSpec`'s `propagatedTo` names the
 * siblings that also changed, surfaced here as a toast so the salesperson
 * isn't left wondering why another card's field just moved.
 */
export function ProductionSpecEditor({ itemId, itemCode, lineGroup, spec, showLineChip }: Props) {
  const form = resolveForm(itemCode);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(spec);
  const [error, setError] = useState<string | null>(null);

  if (!form) return null;

  async function save(next: Record<string, unknown>) {
    setDraft(next);
    setError(null);
    const result = await setProductionSpec(itemId, next);
    setError(result.error ?? null);
    if (!result.error && result.propagatedTo && result.propagatedTo.length > 0) {
      toast.success(`Also updated screen side on ${result.propagatedTo.join(", ")}`);
    }
  }

  async function changeLineGroup(next: number) {
    const result = await setItemLineGroup(itemId, next);
    if (result.error) toast.error(result.error);
  }

  const missing = form.requires.filter((key) => draft[key] === undefined);
  const drills = draft.drills as { required?: boolean; detail?: string } | undefined;
  const sections = (draft.sections as Section[] | undefined) ?? [];

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-brand/40 hover:bg-slate-50 active:bg-slate-100 sm:w-auto"
      >
        <Settings2 className="size-4 text-slate-500" aria-hidden="true" />
        <span>{open ? "Close production spec" : "Production spec"}</span>
        {missing.length > 0 ? (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            {missing.length} missing
          </span>
        ) : null}
        <ChevronDown
          className={cn("size-4 text-slate-400 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="mt-2 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {showLineChip ? (
            <FieldRow label="Line" htmlFor={`${itemId}-line`} className="max-w-[8rem]">
              <select
                id={`${itemId}-line`}
                value={lineGroup}
                onChange={(e) => changeLineGroup(Number(e.target.value))}
                className={fieldInputClass}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </FieldRow>
          ) : null}

          <FieldRow label="Operator screen side" htmlFor={`${itemId}-ui`} className="max-w-xs">
            <select
              id={`${itemId}-ui`}
              value={(draft.ui as string) ?? ""}
              onChange={(e) => save({ ...draft, ui: e.target.value })}
              className={fieldInputClass}
            >
              <option value="">—</option>
              {SCREEN_SIDES.map((side) => (
                <option key={side} value={side}>
                  {side}
                </option>
              ))}
            </select>
          </FieldRow>

          {form.id === "m-series" ? (
            <>
              <FieldRow label="Knife size" htmlFor={`${itemId}-knife-size`} className="max-w-xs">
                <select
                  id={`${itemId}-knife-size`}
                  value={(draft.knifeSize as string) ?? ""}
                  onChange={(e) => save({ ...draft, knifeSize: e.target.value })}
                  className={fieldInputClass}
                >
                  <option value="">—</option>
                  {KNIFE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </FieldRow>

              <FieldRow label="Voltage" htmlFor={`${itemId}-voltage`} hint="Optional" className="max-w-xs">
                <select
                  id={`${itemId}-voltage`}
                  value={(draft.voltage as string) ?? ""}
                  onChange={(e) =>
                    save({ ...draft, voltage: e.target.value === "" ? undefined : e.target.value })
                  }
                  className={fieldInputClass}
                >
                  <option value="">—</option>
                  {VOLTAGES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FieldRow>

              <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <legend className="px-1 text-xs font-medium text-slate-500">Drills</legend>
                <label className="flex min-h-11 items-center gap-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={drills?.required ?? false}
                    onChange={(e) => save({ ...draft, drills: { required: e.target.checked, detail: "" } })}
                    className={checkboxClass}
                  />
                  Drills required
                </label>
                {drills?.required ? (
                  <FieldRow label="Qty, type and size" htmlFor={`${itemId}-drills-detail`}>
                    <input
                      id={`${itemId}-drills-detail`}
                      type="text"
                      maxLength={22}
                      defaultValue={drills?.detail ?? ""}
                      onBlur={(e) => save({ ...draft, drills: { required: true, detail: e.target.value } })}
                      className={fieldInputClass}
                    />
                  </FieldRow>
                ) : null}
              </fieldset>

              <FieldRow label="Special notes" htmlFor={`${itemId}-special-notes`} hint="Optional">
                <input
                  id={`${itemId}-special-notes`}
                  type="text"
                  maxLength={28}
                  defaultValue={(draft.specialNotes as string) ?? ""}
                  onBlur={(e) => save({ ...draft, specialNotes: e.target.value })}
                  className={fieldInputClass}
                />
              </FieldRow>
            </>
          ) : null}

          {form.id === "easyloader" ? (
            <>
              <FieldRow label="Used as" htmlFor={`${itemId}-usage`} className="max-w-xs">
                <select
                  id={`${itemId}-usage`}
                  value={(draft.usage as string) ?? ""}
                  onChange={(e) => save({ ...draft, usage: e.target.value })}
                  className={fieldInputClass}
                >
                  <option value="">—</option>
                  <option value="onload">On load</option>
                  <option value="offload">Off load</option>
                </select>
              </FieldRow>

              {!["EL-2020", "EL-2420"].includes(itemCode) ? (
                <FieldRow label="Custom width (mm)" htmlFor={`${itemId}-custom-width`} className="max-w-xs">
                  <input
                    id={`${itemId}-custom-width`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={9999}
                    defaultValue={(draft.customWidthMm as number) ?? ""}
                    onBlur={(e) =>
                      save({
                        ...draft,
                        customWidthMm: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    className={fieldInputClass}
                  />
                </FieldRow>
              ) : null}

              <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <legend className="px-1 text-xs font-medium text-slate-500">Table sections</legend>
                {[0, 1, 2].map((index) => {
                  const section = sections[index];
                  return (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        inputMode="decimal"
                        aria-label={`Section ${index + 1} length (m)`}
                        placeholder={`Section ${index + 1} length (m)`}
                        defaultValue={section?.lengthM ?? ""}
                        onBlur={(e) =>
                          save({
                            ...draft,
                            sections: writeSection(sections, index, {
                              lengthM: Number(e.target.value),
                              surface: section?.surface ?? "static",
                            }),
                          })
                        }
                        className={cn(fieldInputClass, "w-40")}
                      />
                      <select
                        aria-label={`Section ${index + 1} surface`}
                        value={section?.surface ?? "static"}
                        disabled={!section}
                        onChange={(e) =>
                          save({
                            ...draft,
                            sections: writeSection(sections, index, {
                              lengthM: section?.lengthM ?? 0,
                              surface: e.target.value as Section["surface"],
                            }),
                          })
                        }
                        className={cn(fieldInputClass, "w-36")}
                      >
                        <option value="static">Static</option>
                        <option value="conveyor">Conveyor</option>
                      </select>
                    </div>
                  );
                })}
              </fieldset>

              <label className="flex min-h-11 items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={(draft.paperRollHolder as boolean) ?? false}
                  onChange={(e) => save({ ...draft, paperRollHolder: e.target.checked })}
                  className={checkboxClass}
                />
                Perforated paper roll holder
              </label>

              <label className="flex min-h-11 items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={(draft.crate as boolean) ?? false}
                  onChange={(e) => save({ ...draft, crate: e.target.checked })}
                  className={checkboxClass}
                />
                Crate required
              </label>
            </>
          ) : null}

          {form.id === "fabricpro" ? (
            <>
              <label className="flex min-h-11 items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={(draft.travelPlatform as boolean) ?? false}
                  onChange={(e) => save({ ...draft, travelPlatform: e.target.checked })}
                  className={checkboxClass}
                />
                Travel platform
              </label>

              <FieldRow
                label="Travel platform rail length (m)"
                htmlFor={`${itemId}-rail-length`}
                hint="Optional"
                className="max-w-xs"
              >
                <input
                  id={`${itemId}-rail-length`}
                  type="number"
                  step="0.1"
                  min={0}
                  inputMode="decimal"
                  defaultValue={(draft.railLengthM as number) ?? ""}
                  onBlur={(e) =>
                    save({
                      ...draft,
                      railLengthM: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  className={fieldInputClass}
                />
              </FieldRow>

              <FieldRow
                label="Electrical power rail length (m)"
                htmlFor={`${itemId}-power-rail-length`}
                hint="Optional"
                className="max-w-xs"
              >
                <input
                  id={`${itemId}-power-rail-length`}
                  type="number"
                  step="0.1"
                  min={0}
                  inputMode="decimal"
                  defaultValue={(draft.powerRailLengthM as number) ?? ""}
                  onBlur={(e) =>
                    save({
                      ...draft,
                      powerRailLengthM: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  className={fieldInputClass}
                />
              </FieldRow>

              <label className="flex min-h-11 items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={(draft.exWorks as boolean) ?? false}
                  onChange={(e) => save({ ...draft, exWorks: e.target.checked })}
                  className={checkboxClass}
                />
                Ex-Works
              </label>

              <label className="flex min-h-11 items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={(draft.crate as boolean) ?? false}
                  onChange={(e) => save({ ...draft, crate: e.target.checked })}
                  className={checkboxClass}
                />
                Crate required
              </label>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
