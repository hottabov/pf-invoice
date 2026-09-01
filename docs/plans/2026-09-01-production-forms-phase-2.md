# Production Order Forms — Phase 2

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the EasyLoader table-section data trustworthy — derived from what was actually sold, reconciled against it, and impossible to finalize when it disagrees — and tighten the production-spec panel.

**Why:** An EasyLoader *is* a table. Its length is not a free-text opinion; it is the sum of the `Additional 1.2M lengths` (conveyor) and `Static table 1.2M lengths` (static) options on the quote. A manager typing a section layout that does not match what was sold sends the workshop a table of the wrong length. That is scrap metal, not a typo.

**Depends on:** `docs/plans/2026-09-01-production-order-forms.md` (phase 1, complete) and `docs/specs/2026-09-01-production-order-forms-design.md`.

**Working directory:** `/Users/vadym/Documents/PF Invoice/.worktrees/forms`, branch `feature/production-order-forms`. Baseline: `npm run typecheck` clean, `npm run build` succeeds, `npx vitest run` → 851 passing across 36 files. Database, Docker and Gotenberg are all unreachable — verify with typecheck, lint, vitest and `npm run build`.

---

## Decisions taken

| Question | Decision |
|---|---|
| Terminology | `Operator screen side` for X / M / L / FabricPro. `Control Box Side` for EasyLoader — that is what the printed form says. |
| Default side | `-Y` for every machine that has one. It means material runs right to left, and it is what the M-Series form already prints as `(STD)`. |
| Section reconciliation | **Per surface, not just total.** Conveyor metres must match the `Additional 1.2M lengths` quantity and static metres the `Static table 1.2M lengths` quantity. A total-only check passes a layout with the surfaces swapped, and the workshop then builds the wrong table. |
| EasyLoader with no length options | Cannot be finalized. An EasyLoader with no table length is not a sellable configuration. |
| `EL-3220` / `EL-4030` | Get their own length options, which did not exist. Created **without prices** — inventing a number that lands on a client quote is worse than blocking. The existing "price required" flow already stops finalize until someone enters one. |
| Crate | New `Crate-EL` option, 1400 in every region, `needsReview: false`. It was going to be flagged for review, but `item-options-editor.tsx` renders a `needsReview` option with `disabled={!priced}` — flagging it would have made the option impossible to add to a quote, which defeats the point of adding it. 1400 is the owner's number and stands until they change it in the catalog UI. |
| Admin override | **No.** `recalcDocument`'s discount-cap violations are overridable by an ADMIN because they are commercial. A table-section mismatch is a manufacturing error; nobody gets to wave it through. |
| `Total Table is N m` | Printed on the form at `M54`, and shown in the builder. |

## What moves out of `productionSpec`

`paperRollHolder` and `crate` are deleted from the EasyLoader spec. They are **options**, not production choices — they have prices and belong on the quote. The form's `D69` and `D71` boxes are ticked from the option lines instead, exactly like every other option tick.

This is the same mistake in both directions: a thing the customer pays for must live on the quote, and a thing the workshop needs to know but nobody pays for lives in `productionSpec`.

---

## Task 1: Catalog additions

**Files:** `prisma/seed-data/catalog.json`, `tests/seed-mapping.test.ts` (check whether it needs updating)

- [ ] **Step 1: Add the options**

In `catalog.json`'s `options` array, following the exact shape of the existing entries (see `EL-2020 Additional 1.2M lengths` and `Crate-M`):

```json
{
  "code": "Crate-EL",
  "name": "Crate- Wooden crate for transport",
  "description": "Crate- Wooden crate for transport",
  "price": 1400,
  "needsReview": true,
  "compatibleSeries": ["EL"]
}
```

and four length options carrying an explicit `"price": null` (**not** an omitted key — `CatalogItem` types `price` as `number | null`, not optional, and `tests/catalog.test.ts` enforces it; `mapPrices` in `prisma/seed-lib.ts` then forces `needsReview: true`, and a `needsReview` option has a disabled checkbox in the builder, so these stay unsellable until someone prices them — which is the intent):

```json
{ "code": "EL-3220 Additional 1.2M lengths",   "name": "Additional 1.2M lengths",   "description": "Additional 1.2M lengths",   "price": null, "needsReview": true, "compatibleSeries": [], "compatibleProducts": ["EL-3220"] },
{ "code": "EL-3220 Static table 1.2M lengths", "name": "Static table 1.2M lengths", "description": "Static table 1.2M lengths", "price": null, "needsReview": true, "compatibleSeries": [], "compatibleProducts": ["EL-3220"] },
{ "code": "EL-4030 Additional 1.2M lengths",   "name": "Additional 1.2M lengths",   "description": "Additional 1.2M lengths",   "price": null, "needsReview": true, "compatibleSeries": [], "compatibleProducts": ["EL-4030"] },
{ "code": "EL-4030 Static table 1.2M lengths", "name": "Static table 1.2M lengths", "description": "Static table 1.2M lengths", "price": null, "needsReview": true, "compatibleSeries": [], "compatibleProducts": ["EL-4030"] }
```

Keep the array's existing ordering convention.

- [ ] **Step 2: Confirm the seed accepts them**

Note `tests/catalog.test.ts` hardcodes the option count and an EasyLoader-accessory product allow-list; both need updating. Read `prisma/seed.ts` and `prisma/seed-lib.ts` around the option and compatibility sections and confirm: an option with no `price` produces no `Price` row rather than throwing; `compatibleSeries: ["EL"]` resolves; `compatibleProducts` resolves for products that exist. Run `npx vitest run tests/seed-mapping.test.ts` and report. If that test asserts a fixed option count, update it.

- [ ] **Step 3: Verify and commit**

`npm run typecheck`, `npx vitest run`. Commit: `feat: EasyLoader crate and 3220/4030 table length options`.

---

## Task 2: Table-section reconciliation

The heart of this phase. A pure module, no database, fully unit-testable.

**Files:** create `src/lib/production-forms/table-sections.ts`, test `tests/table-sections.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { SECTION_UNIT_M, tableLengthsFromOptions, reconcileSections } from "../src/lib/production-forms/table-sections";

const opts = (conveyor: number, staticQty: number) => [
  ...(conveyor ? [{ code: "EL-2420 Additional 1.2M lengths", qty: conveyor }] : []),
  ...(staticQty ? [{ code: "EL-2420 Static table 1.2M lengths", qty: staticQty }] : []),
];

describe("tableLengthsFromOptions", () => {
  it("counts conveyor units from the Additional option", () => {
    expect(tableLengthsFromOptions(opts(6, 0))).toEqual({ conveyorUnits: 6, staticUnits: 0, totalM: 7.2 });
  });

  it("counts static units from the Static table option", () => {
    expect(tableLengthsFromOptions(opts(0, 2))).toEqual({ conveyorUnits: 0, staticUnits: 2, totalM: 2.4 });
  });

  it("counts both", () => {
    expect(tableLengthsFromOptions(opts(6, 2))).toEqual({ conveyorUnits: 6, staticUnits: 2, totalM: 9.6 });
  });

  it("matches the option regardless of which EasyLoader width prefixes it", () => {
    expect(tableLengthsFromOptions([{ code: "EL-2020 Additional 1.2M lengths", qty: 3 }]).conveyorUnits).toBe(3);
    expect(tableLengthsFromOptions([{ code: "EL-4030 Static table 1.2M lengths", qty: 1 }]).staticUnits).toBe(1);
  });

  it("ignores unrelated options", () => {
    expect(tableLengthsFromOptions([{ code: "Crate-EL", qty: 1 }])).toEqual({ conveyorUnits: 0, staticUnits: 0, totalM: 0 });
  });

  it("does not confuse the busbar's per-1.2M option for a table length", () => {
    const busbar = [{ code: "EL-2420 Electrical Busbar Per 1.2M Used for Fabric Pro automatic spreader.", qty: 4 }];
    expect(tableLengthsFromOptions(busbar)).toEqual({ conveyorUnits: 0, staticUnits: 0, totalM: 0 });
  });
});

describe("reconcileSections", () => {
  const sold = { conveyorUnits: 6, staticUnits: 2, totalM: 9.6 };

  it("accepts a layout matching both surfaces", () => {
    const result = reconcileSections(sold, [
      { lengthM: 4.8, surface: "conveyor" },
      { lengthM: 2.4, surface: "conveyor" },
      { lengthM: 2.4, surface: "static" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("reports the shortfall per surface", () => {
    const result = reconcileSections(sold, [{ lengthM: 4.8, surface: "conveyor" }]);
    expect(result.ok).toBe(false);
    expect(result.remaining).toEqual({ conveyorUnits: 2, staticUnits: 2 });
  });

  it("rejects a layout whose total matches but whose surfaces are swapped", () => {
    const result = reconcileSections(sold, [
      { lengthM: 7.2, surface: "static" },
      { lengthM: 2.4, surface: "conveyor" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("reports an over-allocation as a negative remainder", () => {
    const result = reconcileSections(sold, [{ lengthM: 12, surface: "conveyor" }]);
    expect(result.ok).toBe(false);
    expect(result.remaining.conveyorUnits).toBeLessThan(0);
  });

  it("rejects a section length that is not a multiple of 1.2", () => {
    const result = reconcileSections(sold, [{ lengthM: 5.0, surface: "conveyor" }]);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/multiple of 1.2/i);
  });

  it("rejects an EasyLoader sold with no table length at all", () => {
    const result = reconcileSections({ conveyorUnits: 0, staticUnits: 0, totalM: 0 }, []);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/no table length/i);
  });

  it("accepts no sections when nothing is split and everything is one surface", () => {
    const result = reconcileSections({ conveyorUnits: 6, staticUnits: 0, totalM: 7.2 }, []);
    expect(result.ok).toBe(true);
  });

  it("tolerates floating point, since 1.2 is not exact in binary", () => {
    const result = reconcileSections({ conveyorUnits: 3, staticUnits: 0, totalM: 3.5999999 }, [
      { lengthM: 1.2, surface: "conveyor" },
      { lengthM: 1.2, surface: "conveyor" },
      { lengthM: 1.2, surface: "conveyor" },
    ]);
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails on the missing module.**

- [ ] **Step 3: Implement**

```ts
/**
 * An EasyLoader is a table, and its length is not a free-text opinion: it is
 * the sum of the `Additional 1.2M lengths` (conveyor) and `Static table 1.2M
 * lengths` (static) options actually sold. This module is the single place
 * that relates the two, so the builder, the finalize gate and the printed
 * form can never disagree about how long the table is.
 */

/** Every table option is priced and counted per 1.2 metre unit. */
export const SECTION_UNIT_M = 1.2;

/**
 * 1.2 has no exact binary representation, so three units summed as floats
 * land near 3.5999999999999996 rather than 3.6. Compare in units, and allow
 * half a millimetre of slack when converting back.
 */
const EPSILON_M = 0.0005;

export type OptionQty = { code: string; qty: number };
export type SectionSurface = "static" | "conveyor";
export type Section = { lengthM: number; surface: SectionSurface };

export type SoldTable = { conveyorUnits: number; staticUnits: number; totalM: number };

// Anchored on "Additional"/"Static table" so the per-1.2M busbar option --
// "Electrical Busbar Per 1.2M" -- is not mistaken for table length.
const CONVEYOR_OPTION = /Additional 1\.2M lengths$/i;
const STATIC_OPTION = /Static table 1\.2M lengths$/i;

export function tableLengthsFromOptions(options: OptionQty[]): SoldTable {
  let conveyorUnits = 0;
  let staticUnits = 0;

  for (const option of options) {
    if (CONVEYOR_OPTION.test(option.code)) conveyorUnits += option.qty;
    else if (STATIC_OPTION.test(option.code)) staticUnits += option.qty;
  }

  // Round-trip through a helper: 6 * 1.2 is 7.199999999999999 in IEEE 754,
  // and a raw multiply fails a strict equality check on the total.
  return { conveyorUnits, staticUnits, totalM: unitsToM(conveyorUnits + staticUnits) };
}

export type Reconciliation = {
  ok: boolean;
  sold: SoldTable;
  /** Units still unaccounted for. Negative means the layout claims more than was sold. */
  remaining: { conveyorUnits: number; staticUnits: number };
  problems: string[];
};

export function reconcileSections(sold: SoldTable, sections: Section[]): Reconciliation {
  const problems: string[] = [];

  const used = { conveyorUnits: 0, staticUnits: 0 };
  for (const section of sections) {
    const units = section.lengthM / SECTION_UNIT_M;
    if (Math.abs(units - Math.round(units)) > EPSILON_M) {
      problems.push(`Section length ${section.lengthM}m is not a multiple of 1.2m`);
      continue;
    }
    if (section.surface === "conveyor") used.conveyorUnits += Math.round(units);
    else used.staticUnits += Math.round(units);
  }

  const remaining = {
    conveyorUnits: sold.conveyorUnits - used.conveyorUnits,
    staticUnits: sold.staticUnits - used.staticUnits,
  };

  if (sold.conveyorUnits === 0 && sold.staticUnits === 0) {
    problems.push(
      "This EasyLoader has no table length: add Additional 1.2M lengths or Static table 1.2M lengths",
    );
  }

  // No sections at all means "one undivided table", which is the common case
  // and always consistent with whatever was sold.
  if (sections.length > 0) {
    if (remaining.conveyorUnits !== 0) {
      problems.push(
        `Conveyor sections total ${used.conveyorUnits * SECTION_UNIT_M}m but ${sold.conveyorUnits * SECTION_UNIT_M}m was sold`,
      );
    }
    if (remaining.staticUnits !== 0) {
      problems.push(
        `Static sections total ${used.staticUnits * SECTION_UNIT_M}m but ${sold.staticUnits * SECTION_UNIT_M}m was sold`,
      );
    }
  }

  return { ok: problems.length === 0, sold, remaining, problems };
}
```

- [ ] **Step 4: Run the tests (14 cases), typecheck, lint, commit** `feat: reconcile EasyLoader table sections against the options sold`.

---

## Task 3: Production spec schema changes

**Files:** `src/lib/validation/production-spec.ts`, `tests/production-spec-validation.test.ts`

- [ ] **Step 1: Update the tests first** to express the new rules, then change the schema:

- `screenSideSchema` gains `.default("-Y")` — every machine that has a side defaults to material running right to left, which the M-Series form already prints as `(STD)`.
- `easyLoaderSpecSchema`: **delete `paperRollHolder` and `crate`** (they became options in Task 1). `usage` gains `.default("onload")`.
- Because `ui` now always has a value, **remove `"ui"` from every form spec's `requires`** in Task 4 — a defaulted field can never be missing, and leaving it there would permanently disable the download button.
- EasyLoader's `requires` becomes `["usage"]`; `sections` is no longer required, because "no sections" legitimately means one undivided table. The section *reconciliation* is what gates finalize, not presence.

Add tests asserting: parsing `{}` for the M-Series yields `ui: "-Y"`; an EasyLoader spec with `paperRollHolder` or `crate` is rejected as an unknown key (or silently stripped — assert whichever Zod 4 does here, and say which in your report).

- [ ] **Step 2: Run tests, typecheck, commit** `feat: default the machine side to -Y, move crate and roll holder to options`.

---

## Task 4: EasyLoader form spec

**Files:** `src/lib/production-forms/specs/easyloader.ts`, `src/lib/production-forms/specs/m-series.ts`, `src/lib/production-forms/specs/fabricpro.ts`, `tests/production-forms-resolve.test.ts`

- [ ] **Step 1: Update the ticks**

Replace the two `productionSpec`-driven ticks with option ticks, using the same `optionTick`-style helper the M-Series spec uses so they carry `covers` and stop showing up as unmatched:

- `D69` — the perforated paper roll holder, matched on `/Roll Holder/i` (the catalog codes differ per width and one carries a stray `#`: `EL-2020 #ST620-2020 Roll Holder…` versus `EL-2420 ST620-2420 Roll Holder…`).
- `D71` — `/^Crate-EL$/`.

Also add `D56` if it is not already an option tick for the synchronisation feature.

- [ ] **Step 2: Add the Total Table line**

A new `values` entry at `M54`: `Total Table is 9.6 m`, from the item's own option lines via `tableLengthsFromOptions`. `M54` is blank in the template, sits in the same notes column as the three `(Multiple of 1.2m…)` annotations, and is inside the print area — verified against the template. Omit the line entirely when nothing was sold, rather than printing `0 m`.

This is the one place in any form where we print something the paper form never had. It is justified: the total is what the workshop actually builds to, and it is currently derived by hand from three separate section boxes.

- [ ] **Step 3: Drop `"ui"` from `requires` in all three specs** (see Task 3).

- [ ] **Step 4: Extend the resolve tests** to cover the two new option ticks and the `M54` value, run, typecheck, lint, commit `feat: EasyLoader crate and roll holder tick from options, print total table length`.

---

## Task 5: Finalize gate

**Files:** `src/lib/actions/finalize.ts`, `src/app/api/documents/[documentId]/production-forms/route.ts`, `tests/finalize-validation.test.ts`

- [ ] **Step 1:** Add a check that runs over every EasyLoader item on the document, builds `tableLengthsFromOptions` from its option lines and `reconcileSections` against its `productionSpec.sections`, and refuses to finalize when any of them is not `ok`.

**This is not overridable by an ADMIN.** Read the existing override for discount-cap violations and deliberately do not extend it here: a discount cap is a commercial judgement someone senior may legitimately overrule, and a table of the wrong length is scrap. Put that reasoning in a comment.

- [ ] **Step 2:** The production-forms route already returns 422 for missing requirements. Add the same reconciliation to its blockers so a form can never be printed from an inconsistent quote, even if it somehow got finalized.

- [ ] **Step 3:** Tests, typecheck, lint, commit `feat: block finalize when EasyLoader sections disagree with the table sold`.

---

## Task 6: Production spec panel rework

**Files:** `src/components/builder/production-spec-editor.tsx`

The panel is currently a stack of full-width label-above-control rows. Make it compact and make the table sections honest.

- [ ] **Step 1: Compact layout.** Put each label and its control on one row — `Operator screen side  [ -Y ▾ ]`, `Used as  [ On load ▾ ]`. Follow whatever the codebase already does for dense rows; `item-options-editor.tsx` is the nearest precedent.

- [ ] **Step 2: Correct labels.** `Control Box Side` on EasyLoader, `Operator screen side` on M-Series and FabricPro. Both default to `-Y`, and `Used as` defaults to `On load`, shown preselected rather than as an empty `—`.

- [ ] **Step 3: Table sections behind a button.** Most EasyLoaders are one undivided table, so the three section rows are noise. Show instead a summary line — `Table: 9.6 m (8 × 1.2m conveyor)` — and a `Manage table sections` button that reveals the three rows. The form has exactly three, so the UI has exactly three.

- [ ] **Step 4: Steppers, not free text.** Each section length uses the same `Minus`/`Plus` stepper as the option quantities in `item-options-editor.tsx`, stepping by 1.2 m. Re-use that markup rather than inventing a second stepper style.

- [ ] **Step 5: Live remaining indicator.** While the rows are open, show what is left to allocate, per surface, in both units and metres — `2 sections left (2.4 m conveyor)`. When `reconcileSections` reports a problem, show it in `text-destructive` and make clear finalize is blocked. This is the whole point of the exercise: the manager must be able to see, while typing, that 4.8 of 7.2 metres are placed.

- [ ] **Step 6:** typecheck, lint, `npm run build`, commit `feat: compact production spec panel with reconciled table sections`.

---

## Task 7: End-to-end verification

- [ ] **Step 1:** Re-run the phase-1 end-to-end render (patch all three templates from a fixture quote, convert with LibreOffice, merge) with an EasyLoader carrying `6 × Additional` and `2 × Static`, split as 4.8 conveyor / 2.4 conveyor / 2.4 static.

- [ ] **Step 2:** Confirm on the printed page: three section rows filled with the right surfaces ticked, `Total Table is 9.6 m` at `M54` legible and not colliding with anything, crate and roll holder ticked from the options, still exactly one A4 page.

- [ ] **Step 3:** Report with the rendered PDF.
