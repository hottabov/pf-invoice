import type { z } from "zod";
import { missingKeys } from "@/lib/validation/production-spec";
import { FORM_SPECS } from "./specs";
import type { CellPatch } from "./xlsx-patch";
import type { FormContext, FormSpec } from "./types";

/**
 * Which form a quote item prints on. Matching is by product code, not series:
 * HDRF-180/220/320 have their own form regardless of which catalogue series
 * they sit in (their own "HDRF" series today; formerly nested inside EF
 * alongside EasyFeeder), so series-level matching would be wrong.
 */
export function resolveForm(code: string): FormSpec | null {
  return FORM_SPECS.find((spec) => spec.matches(code)) ?? null;
}

/** The productionSpec schema for an item, or null when it prints no form. */
export function specSchemaForCode(code: string): z.ZodTypeAny | null {
  return resolveForm(code)?.specSchema ?? null;
}

/** Which of a form's requirements this item has not answered yet. */
export function missingRequirements(spec: FormSpec, productionSpec: unknown): string[] {
  return missingKeys(productionSpec, spec.requires);
}

/**
 * Turns a spec plus a context into the exact list of cell writes. A tick is
 * the literal "X"; the cell's border and centring already live in the
 * template. Empty values are skipped so a missing optional never blanks a
 * cell that was meant to stay untouched.
 */
export function buildPatches(spec: FormSpec, ctx: FormContext): CellPatch[] {
  const patches: CellPatch[] = [];

  for (const { cell, from } of spec.values) {
    const value = from(ctx);
    if (value === null || value === undefined || value === "") continue;
    patches.push({ cell, value: String(value) });
  }

  for (const { cell, from } of spec.replaces) {
    const value = from(ctx);
    if (value === null || value === undefined) continue;
    patches.push({ cell, value });
  }

  for (const { cell, when } of spec.ticks) {
    if (when(ctx)) patches.push({ cell, value: "X" });
  }

  return patches;
}

/**
 * Option codes on this item that the form does not account for anywhere.
 *
 * These are not dropped: they go on the "Additional items" sheet. An option
 * the workshop never sees is the worst thing this feature could do, so the
 * absence of a box has to be detectable rather than invisible -- which is
 * what `covers` on each option tick exists for.
 *
 * A tick is not the only way a form can account for an option, though. The
 * EasyLoader's table length options are represented by the three section
 * rows and the printed total rather than by a box of their own, and listing
 * them again on the Additional items sheet would tell the workshop the form
 * had missed something it did not miss. `coversOptions` is how a spec
 * declares that kind of coverage.
 */
export function unmatchedOptionCodes(spec: FormSpec, ctx: FormContext): string[] {
  const covered = [
    ...spec.ticks
      .map((tick) => tick.covers)
      .filter((pattern): pattern is RegExp => pattern !== undefined),
    ...(spec.coversOptions ?? []),
  ];

  return ctx.item.optionCodes.filter((code) => !covered.some((pattern) => pattern.test(code)));
}
