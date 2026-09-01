"use client";

import { useState } from "react";
import { ChevronDown, Minus, Plus, Settings2 } from "lucide-react";
import { fieldInputClass, useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { setItemLineGroup, setProductionSpec } from "@/lib/actions/production";
import { reconcileEasyLoaderSections, resolveForm } from "@/lib/production-forms/resolve";
import { SECTION_UNIT_M, tableLengthsFromOptions, type OptionQty, type Section } from "@/lib/production-forms/table-sections";

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

/**
 * Steps a section length by one 1.2m unit, snapping to the nearest exact
 * multiple first -- a plain `current + SECTION_UNIT_M` compounds the float
 * error 1.2 already carries (see table-sections.ts) after a few clicks, and
 * clamps at 0 rather than going negative.
 */
function stepLength(current: number, direction: 1 | -1): number {
  const units = Math.round(current / SECTION_UNIT_M) + direction;
  return Math.max(0, Math.round(units * SECTION_UNIT_M * 10) / 10);
}

/** "3 sections left (3.6 m conveyor)" / "1 section over (1.2 m static)" --
 * the friendly, per-surface phrasing the live indicator uses while the
 * section rows are open. `units` is signed: positive is unallocated,
 * negative is over-allocated (reconcileSections' convention). */
function remainingLabel(units: number, surface: string): string {
  const count = Math.abs(units);
  const metres = (count * SECTION_UNIT_M).toFixed(1);
  const noun = count === 1 ? "section" : "sections";
  return units > 0 ? `${count} ${noun} left (${metres} m ${surface})` : `${count} ${noun} over (${metres} m ${surface})`;
}

const SCREEN_SIDES = ["+Y", "-Y"] as const;
const KNIFE_SIZES = ["1.5x5.0", "1.5x7.0", "2.0x7.0"] as const;
const VOLTAGES = ["220V", "400V", "415V", "480V"] as const;

const checkboxClass = "size-5 shrink-0 rounded border-slate-300 accent-brand";
/** Compact control height, matching the dense Qty/attribute rows in
 * item-options-editor.tsx rather than fieldInputClass's default 44px. */
const compactControlClass = "h-9";

/**
 * One label + control per row, used throughout this panel instead of the
 * label-above-control `FieldRow` -- with a dozen machine-specific fields
 * live at once, a stacked layout made this the tallest thing on the item
 * card. Mirrors the dense rows in item-options-editor.tsx (e.g. its "Qty"
 * control), just generalised to a labelled row rather than an inline span.
 */
function CompactField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={htmlFor} className="w-44 shrink-0 text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

type Props = {
  itemId: string;
  itemCode: string;
  lineGroup: number;
  spec: Record<string, unknown>;
  /**
   * This item's OPTION lines as code+qty pairs. Needed only for the
   * EasyLoader branch: `tableLengthsFromOptions`/`reconcileEasyLoaderSections`
   * derive what table was actually sold from exactly this shape, so the
   * summary line and live remaining indicator below reconcile against the
   * same numbers the finalize gate and the production-forms route check.
   * Ignored for every other machine.
   */
  optionQtys: OptionQty[];
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
export function ProductionSpecEditor({ itemId, itemCode, lineGroup, spec, optionQtys, showLineChip }: Props) {
  const form = resolveForm(itemCode);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(spec);
  const [error, setError] = useState<string | null>(null);
  // Most EasyLoaders are one undivided table, so the three section rows
  // start hidden -- unless this item already has a split layout, in which
  // case collapsing it by default would hide the one thing a returning
  // manager most needs to see.
  const [sectionsOpen, setSectionsOpen] = useState(
    () => Array.isArray(spec.sections) && (spec.sections as unknown[]).length > 0
  );

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
  // "Operator screen side" everywhere except the EasyLoader, whose printed
  // form calls the same +Y/-Y choice "Control Box Side".
  const screenSideLabel = form.id === "easyloader" ? "Control Box Side" : "Operator screen side";

  // EasyLoader-only: what the options actually sold add up to, the summary
  // line derived from it, and (while the section rows are open) how much of
  // it the drawn sections still leave unaccounted for. Computed unconditionally
  // (cheap, pure) and only rendered inside the `form.id === "easyloader"` block.
  const sold = tableLengthsFromOptions(optionQtys);
  const soldParts = [
    sold.conveyorUnits > 0 ? `${sold.conveyorUnits} × 1.2m conveyor` : null,
    sold.staticUnits > 0 ? `${sold.staticUnits} × 1.2m static` : null,
  ].filter((part): part is string => Boolean(part));
  const soldSummary = sold.totalM > 0 ? `Table: ${sold.totalM} m (${soldParts.join(" + ")})` : null;

  const reconciliation = reconcileEasyLoaderSections(itemCode, draft, optionQtys);
  let remainingMessage: string | null = null;
  let remainingBlocks = false;
  if (reconciliation) {
    if (sections.length === 0) {
      // "No sections" legitimately means one undivided table -- nothing to
      // report unless there's also nothing sold, and that case already has
      // its own banner above the summary line.
      remainingMessage = sold.totalM > 0 ? "No sections drawn — the whole table builds as one undivided run." : null;
    } else if (!reconciliation.ok) {
      const parts = [
        reconciliation.remaining.conveyorUnits !== 0
          ? remainingLabel(reconciliation.remaining.conveyorUnits, "conveyor")
          : null,
        reconciliation.remaining.staticUnits !== 0
          ? remainingLabel(reconciliation.remaining.staticUnits, "static")
          : null,
      ].filter((part): part is string => Boolean(part));
      // Falls back to reconcileSections' own message for a problem the
      // per-surface phrasing above can't express, e.g. a legacy section
      // length that isn't a whole 1.2m multiple (the stepper below can no
      // longer create one, but old data may still carry one).
      remainingMessage = parts.length > 0 ? parts.join(", ") : reconciliation.problems.join("; ");
      remainingBlocks = true;
    } else {
      remainingMessage = `Sections match the ${sold.totalM} m sold.`;
    }
  }

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
            <CompactField label="Line" htmlFor={`${itemId}-line`}>
              <select
                id={`${itemId}-line`}
                value={lineGroup}
                onChange={(e) => changeLineGroup(Number(e.target.value))}
                className={cn(fieldInputClass, compactControlClass, "w-24")}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </CompactField>
          ) : null}

          <CompactField label={screenSideLabel} htmlFor={`${itemId}-ui`}>
            <select
              id={`${itemId}-ui`}
              // screenSideSchema defaults to "-Y" (material right to left,
              // the M-Series form's printed "(STD)") -- shown preselected
              // here so a manager who never opens this panel still sees the
              // correct standard rather than a blank "—".
              value={(draft.ui as string) ?? "-Y"}
              onChange={(e) => save({ ...draft, ui: e.target.value })}
              className={cn(fieldInputClass, compactControlClass, "w-24")}
            >
              {SCREEN_SIDES.map((side) => (
                <option key={side} value={side}>
                  {side}
                </option>
              ))}
            </select>
          </CompactField>

          {form.id === "m-series" ? (
            <>
              <CompactField label="Knife size" htmlFor={`${itemId}-knife-size`}>
                <select
                  id={`${itemId}-knife-size`}
                  value={(draft.knifeSize as string) ?? ""}
                  onChange={(e) => save({ ...draft, knifeSize: e.target.value })}
                  className={cn(fieldInputClass, compactControlClass, "w-32")}
                >
                  <option value="">—</option>
                  {KNIFE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </CompactField>

              <CompactField label="Voltage (optional)" htmlFor={`${itemId}-voltage`}>
                <select
                  id={`${itemId}-voltage`}
                  value={(draft.voltage as string) ?? ""}
                  onChange={(e) =>
                    save({ ...draft, voltage: e.target.value === "" ? undefined : e.target.value })
                  }
                  className={cn(fieldInputClass, compactControlClass, "w-28")}
                >
                  <option value="">—</option>
                  {VOLTAGES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </CompactField>

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
                  <CompactField label="Qty, type and size" htmlFor={`${itemId}-drills-detail`}>
                    <input
                      id={`${itemId}-drills-detail`}
                      type="text"
                      maxLength={22}
                      defaultValue={drills?.detail ?? ""}
                      onBlur={(e) => save({ ...draft, drills: { required: true, detail: e.target.value } })}
                      className={cn(fieldInputClass, compactControlClass, "flex-1 min-w-[10rem]")}
                    />
                  </CompactField>
                ) : null}
              </fieldset>

              <CompactField label="Special notes (optional)" htmlFor={`${itemId}-special-notes`}>
                <input
                  id={`${itemId}-special-notes`}
                  type="text"
                  maxLength={28}
                  defaultValue={(draft.specialNotes as string) ?? ""}
                  onBlur={(e) => save({ ...draft, specialNotes: e.target.value })}
                  className={cn(fieldInputClass, compactControlClass, "flex-1 min-w-[10rem]")}
                />
              </CompactField>
            </>
          ) : null}

          {form.id === "easyloader" ? (
            <>
              <CompactField label="Used as" htmlFor={`${itemId}-usage`}>
                <select
                  id={`${itemId}-usage`}
                  // usage defaults to "onload" -- shown preselected for the
                  // same reason the screen side is, above.
                  value={(draft.usage as string) ?? "onload"}
                  onChange={(e) => save({ ...draft, usage: e.target.value })}
                  className={cn(fieldInputClass, compactControlClass, "w-32")}
                >
                  <option value="onload">On load</option>
                  <option value="offload">Off load</option>
                </select>
              </CompactField>

              {!["EL-2020", "EL-2420"].includes(itemCode) ? (
                <CompactField label="Custom width (mm)" htmlFor={`${itemId}-custom-width`}>
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
                    className={cn(fieldInputClass, compactControlClass, "w-28")}
                  />
                </CompactField>
              ) : null}

              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
                {soldSummary ? (
                  <p className="text-sm text-slate-600">{soldSummary}</p>
                ) : (
                  <p className="text-sm text-destructive">
                    No table length sold yet — add Additional 1.2M lengths or Static table 1.2M lengths.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setSectionsOpen((o) => !o)}
                  aria-expanded={sectionsOpen}
                  className="focus-ring inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {sectionsOpen ? "Hide table sections" : "Manage table sections"}
                  <ChevronDown
                    className={cn("size-3.5 text-slate-400 transition-transform", sectionsOpen && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>

                {sectionsOpen ? (
                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-2">
                    {[0, 1, 2].map((index) => {
                      const section = sections[index];
                      return (
                        <div key={index} className="flex flex-wrap items-center gap-2">
                          <span className="w-20 shrink-0 text-xs text-slate-500">Section {index + 1}</span>
                          <div className="flex items-center gap-1.5">
                            {/* Stepper markup mirrors the option-quantity control in
                                item-options-editor.tsx: a compact 36px square inside a
                                44px tap target. Steps by 1.2m instead of 1 unit. */}
                            <button
                              type="button"
                              aria-label={`Decrease section ${index + 1} length`}
                              disabled={!section || section.lengthM <= 0}
                              onClick={() =>
                                save({
                                  ...draft,
                                  sections: writeSection(sections, index, {
                                    lengthM: stepLength(section?.lengthM ?? 0, -1),
                                    surface: section?.surface ?? "static",
                                  }),
                                })
                              }
                              className="group focus-ring flex size-11 shrink-0 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <span
                                aria-hidden="true"
                                className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors md:group-hover:bg-slate-50"
                              >
                                <Minus className="size-3.5" />
                              </span>
                            </button>
                            <span
                              className="w-16 shrink-0 text-center text-sm font-medium text-slate-700"
                              aria-label={`Section ${index + 1} length`}
                            >
                              {(section?.lengthM ?? 0).toFixed(1)} m
                            </span>
                            <button
                              type="button"
                              aria-label={`Increase section ${index + 1} length`}
                              onClick={() =>
                                save({
                                  ...draft,
                                  sections: writeSection(sections, index, {
                                    lengthM: stepLength(section?.lengthM ?? 0, 1),
                                    surface: section?.surface ?? "static",
                                  }),
                                })
                              }
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
                            className={cn(fieldInputClass, compactControlClass, "w-32")}
                          >
                            <option value="static">Static</option>
                            <option value="conveyor">Conveyor</option>
                          </select>
                        </div>
                      );
                    })}

                    {remainingMessage ? (
                      <p className={cn("text-xs", remainingBlocks ? "text-destructive" : "text-slate-500")}>
                        {remainingMessage}
                        {remainingBlocks ? " Finalize is blocked until this matches what was sold." : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
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

              <CompactField label="Travel platform rail length (m, optional)" htmlFor={`${itemId}-rail-length`}>
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
                  className={cn(fieldInputClass, compactControlClass, "w-28")}
                />
              </CompactField>

              <CompactField
                label="Electrical power rail length (m, optional)"
                htmlFor={`${itemId}-power-rail-length`}
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
                  className={cn(fieldInputClass, compactControlClass, "w-28")}
                />
              </CompactField>

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
