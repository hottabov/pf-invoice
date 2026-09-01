# Production Order Forms — Design Spec

Date: 2026-09-01 · Status: approved, pending implementation · Depends on: `docs/specs/2026-08-29-pathquote-design.md`

## 1. Purpose

When a client signs a quotation, a manager currently fills the Pathfinder production order forms by hand, copying the machine, its width, its options and the client details out of the quote. One form per machine, one A4 sheet each, hand-ticked with `X` in printed boxes. The filled form goes to the workshop and becomes the production job.

This feature generates those forms automatically from a finalized quote: correct boxes ticked, all derivable fields filled, downloadable as a single print-ready PDF.

**The form design does not change.** Production staff are used to it. The originals in `RAW/Order Forms/` are the source of truth for layout and are reused verbatim as templates.

## 2. Scope

**In scope (first iteration):** M-Series, EasyLoader, FabricPro — the common combined order.

**Out of scope for now, same engine later:** X-Calibre, L-Series, Punchline, EasyFeeder, HDRF, FabricPro Trolley, Leather Nesting Station, Software Order Form, Miscellaneous. Each is one new spec file plus one template; no engine changes.

**Never in scope:** the "Office Use Only" block on every form (Machine Serial No, Distribution Date, Dispatch Date, Installation dates, Person, Packed By, Checked By). These are printed as underscore rules and are filled by hand in the workshop. We leave them blank by design.

## 3. Decisions taken

| Question | Decision | Rationale |
|---|---|---|
| Where do forms come from? | Stateless render from a FINAL `QUOTE` | A finalized quote is already an immutable snapshot, so output is reproducible with zero extra storage. No `ProductionOrder` entity — it would only duplicate the quote and create a "which one wins after an edit" problem. |
| When can they be generated? | FINAL quotes only | Prevents the workshop receiving a draft that is still being reworked. |
| Rendering technique | **Spike-gated.** Primary: patch the original xlsx, convert via Gotenberg's LibreOffice module. Fallback: React/HTML via Gotenberg's Chromium module. | See §8. Exactness is the top requirement; the xlsx route is exact by construction rather than by CSS effort. |
| Output | One merged PDF, one A4 page per form, plus per-form individual downloads | User choice. |
| Fonts | Whatever the Gotenberg container provides | Century Gothic is a licensed Microsoft font; the workshop reads the `X` marks, not the typography. |
| Custom / unmappable lines | Separate "Additional items" sheet, never on the machine form | Training hours and services are commercial, not manufacturing, information. |
| Drills | Blocks generation when empty | The form itself says `"TBC" is not acceptable`. |

## 4. Data model changes

Two columns on `DocumentItem`, one lookup table with a foreign key from `Company`.

```prisma
model Industry {
  id        String    @id @default(cuid())
  name      String    @unique
  createdAt DateTime  @default(now())
  companies Company[]
}

model Company {
  industryId String?    // new
  industry   Industry?  @relation(fields: [industryId], references: [id], onDelete: SetNull)
}

model DocumentItem {
  productionSpec Json?            // new — sales-side production choices
  lineGroup      Int  @default(1) // new — production line grouping
}
```

`Industry` is a real lookup table rather than free text on the company: the list will be bulk-imported, so the same industry must be one row that every company points at, not a string repeated with drifting spellings. It is global, not per-region — an industry means the same thing in AU and US.

`onDelete: SetNull` so removing an industry never blocks and never cascades into companies. There is no delete or merge UI in this iteration (§12).

**Distributor** on the form header is the Pathfinder legal entity for the region ("Pathfinder Australia Pty Ltd" for AU, a different name for US). It comes from `Document.entitySnapshot.entityName`, which is already frozen at finalize time, falling back to `Region.entityName`. **Name** is `Document.author.name` — whoever created the quote. Neither needs a new field.

### 4.1 `productionSpec`

A Zod-validated object whose shape depends on the item's series. Stored per `DocumentItem`.

```ts
// M-Series (and later X-Calibre)
{ ui: "+Y" | "-Y",
  knifeSize: "1.5x5.0" | "1.5x7.0" | "2.0x7.0",
  voltage?: "220V" | "400V" | "415V" | "480V",
  drills: { required: boolean; detail: string },   // detail required when required === true
  specialNotes?: string }

// EasyLoader
{ ui: "+Y" | "-Y",
  usage: "onload" | "offload",
  customWidthMm?: number,                          // only when the product is not EL-2020/EL-2420
  sections: Array<{ lengthM: number; surface: "static" | "conveyor" }>,  // up to 3
  rollFeed?: { qty: number; distancesMm: number[] },                     // up to 4
  paperRollHolder?: boolean,
  crate?: boolean }

// FabricPro
{ ui: "+Y" | "-Y",
  travelPlatform: boolean,
  railLengthM?: number,
  powerRailLengthM?: number,
  exWorks?: boolean,
  crate?: boolean }
```

`productionSpec` **remains editable after the quote is finalized.** It carries no commercial meaning — it does not affect price, tax or totals — so the finalize lock explicitly excludes it. Requiring unfinalize/refinalize to correct a knife size would churn document numbering for no reason.

### 4.2 `lineGroup` and the `±Y` rule

`ui` (`+Y` / `-Y`) is the side the operator screen sits on. A cutter, its EasyLoader and its FabricPro stand next to each other and **must have the screen on the same side** — getting this wrong is a physical installation fault, not a cosmetic one.

A quote can contain more than one production line: two `M-Series + EasyLoader` lines with screens on the right, and a third `X-Calibre + EasyLoader + FabricPro` line with screens on the left. This is rare but real.

`lineGroup` is a plain integer tag on `DocumentItem`, defaulting to `1`. Items sharing a value belong to the same line. Setting `ui` on any item writes it to **every item in the same `lineGroup` and no other**, so propagation is deterministic rather than heuristic.

The line chip is hidden in the builder unless the document contains two or more machine items, so the single-line case — the overwhelming majority — never sees it.

We deliberately do not model a `ProductionLine` table. It would pull in grouping UI, ordering, naming and delete-cascade handling for a rare case that one integer already makes correct. If lines later need to be first-class, the form renderer does not change: it reads `ui` off the item either way.

## 5. Form spec registry

One declarative TypeScript file per form, sitting beside the original xlsx committed as an asset. Adding a form is one spec file plus one template — the engine is untouched.

```
src/lib/production-forms/
  engine/
    patch-workbook.ts      // xlsx cell patching
    resolve.ts             // item → FormSpec, options → ticks
    context.ts             // Document → FormContext
    render.ts              // Gotenberg convert + merge
  specs/
    m-series.ts
    easyloader.ts
    fabricpro.ts
  templates/
    m-series-order-12.xlsx
    easy-loader-13.xlsx
    fabric-pro-order-form-08.xlsx
```

```ts
export type FormSpec = {
  id: string;
  template: string;
  sheet: string;
  matches: (item: FormItem) => boolean;
  values:   Array<{ cell: string; from: (ctx: FormContext) => string | number | null }>;
  replaces: Array<{ cell: string; from: (ctx: FormContext) => string | null }>;  // overwrites printed label text
  ticks:    Array<{ cell: string; when: (ctx: FormContext) => boolean }>;
  requires: string[];          // productionSpec keys that block generation when absent
};
```

A tick is the literal string `"X"` written into the named cell. The cell's border, font and centring already live in the template and are never touched.

`requires` per form in this iteration:

| Form | `requires` |
|---|---|
| M-Series | `ui`, `knifeSize`, `drills` |
| EasyLoader | `ui`, `usage`, `sections` |
| FabricPro | `ui` |

`drills` counts as satisfied when `drills.required === false`, or when it is `true` and `drills.detail` is non-empty.

### 5.1 M-Series cell map (verified against `M-series order 12.xlsx`, sheet `Order`)

Header values — each is the underlined run to the right of its printed label:

| Cell | Source |
|---|---|
| `G8` | distributor entity name |
| `N8` | quote author name — **not `M8`**: the `Name:` label lives in `L8`, which is only 4.3 characters wide, so it relies on overflowing into `M8`. Writing into `M8` clips the label to "Nam". Verified in the spike. |
| `H13` | company name |
| `H14`, `H15` | company address lines |
| `H16` | contact full name |
| `H17` | contact position |
| `H18` | contact phone |
| `H20` | contact email |
| `H21` | `Company.industry.name` |
| `M13`–`M15` | delivery address (falls back to the main address when `deliverySameAsMain`) |
| `M73` | MTS travel distance, metres — from the `MTS` line's `attributes.metres` |
| `H81` | drills — the literal `Yes` or `No`, right of the `Drill required?` label |
| `J82` | drills detail, right of the `If Yes Qty, Type & Size required` label |
| `N81` | special notes, under the `Special Notes` heading |

Text longer than its cell overflows into the empty cells to its right, exactly as in Excel, so address lines lay out on their own.

Rows 81 and 82 are the exception and were the spike's main finding. They are the tall hand-writing rows (heights 28.5 and 33.75) and carry a correspondingly large font, so very little text fits, and the drills column and the notes column run into each other. The measured caps, enforced in the Zod schema:

| Field | Cell | Cap |
|---|---|---|
| Drills detail | `J82` | 22 characters |
| Special notes | `N81` | 28 characters |

Notes are one line only. `N82` is deliberately left alone: a second notes line collides with the drills detail beside it.

Tick boxes:

| Cells | Group |
|---|---|
| `H25` `J25` `L25` `O25` | model M3 / M5 / M7 / M10 |
| `H29` `J29` `L29` `O29` | width 180 / 220 / 300 / 390 |
| `J33` `J35` | UI `+Y` / `-Y` |
| `F42`…`O57` | options, three columns — see §6.2 |
| `F62` `J62` `O62` `F64` `J64` | PathWorks PDG / WPN / WPL / ANT T5.5 / ANT T6.0 |
| `F68` `J68` `O68` | knife size 1.5×5.0 / 1.5×7.0 / 2.0×7.0 |
| `D72` | MTS present |

Model and width are parsed from the product code with `/^M(3|5|7|10)(180|220|300|390)$/`. The catalog's `Product.specs` is null for every row, so the code is the only reliable source. The regex is unambiguous for all sixteen M-Series codes: no `M1` model exists, so `M10180` can only split as `M10` + `180`, and no width begins with a digit that would let a shorter height alternative consume it. The parse is covered by a unit test enumerating all sixteen codes.

### 5.2 EasyLoader cell map (`Easy Loader 13.xlsx`, sheet `Sheet1`)

Header: `G11` distributor, `N11` name, `H16`–`H18` company/address, `H19` contact, `H20` title, `H21` phone, `H23` email, `H24` industry, `O16`–`O18` delivery address.

Ticks: `I31` `I33` `I35` width 2020 / 2420 / Custom · `I38` `O38` On Load / Off Load · `I40` `O40` `-Y` / `+Y` · `I45` `K45`, `I49` `K49`, `I53` `K53` surface Static / Conveyor for sections 1–3 · `D56` sync feature · `D59` single roll feed · `D69` paper roll holder · `D71` crate.

Values: `I43`, `I47`, `I51` (each merged with the next column) section lengths in metres · `F61` roll-feed qty · `K61` `K63` `K65` `K67` roll-feed distances in mm.

The custom width is a special case. `J35` holds the printed label `"  Custom     ___________mm"`, so there is no separate cell to write into; the whole label is replaced with `"  Custom     2800mm"`. This is the one place where we overwrite printed text rather than filling a blank, and it is declared explicitly in the spec file as a `replaces` entry rather than a plain `values` entry so the intent is visible.

`EL-3220` and `EL-4030` have no printed box, so they tick **Custom** and take that path.

### 5.3 FabricPro cell map (`Fabric Pro order form 08.xlsx`, sheet `Sheet1`)

Header: `G10` distributor, `N10` name, `H15`–`H17` company/address, `H18` contact, `H19` title, `H20` phone, `H22` email, `H23` industry, `O15`–`O17` delivery address.

Ticks: `H27` `J27` `M27` model FP-180 / FP-220 / FP-300 · `H35` voltage 220-240/50-60 · `J41` `O41` `-Y` / `+Y` · `J44` travel platform · `J46` travel rail · `J48` electrical power rail · `D58` Ex-Works · `D68` crate.

Values: `N46` travel rail length, `N48` power rail length (both merged with the following column).

`FP-TROLLEY` does not match this spec — it belongs to the separate Fabric Trolley form, out of scope for the first iteration.

## 6. Resolution rules

### 6.1 Item → form

Matching is on **product code, not series**. `HDRF-180/220/320` live in the `EF` series alongside EasyFeeder but have their own form, so series-level matching would be wrong. Page order in the merged PDF follows `DocumentItem.sortOrder`.

### 6.2 Option → tick

Catalog codes carry series suffixes (`ABR-M`, `HDC-L`, `PM-M`, `VRB-180`); form labels use base codes (`ABR`, `HDC`, `PM`, `VRB`). Matching is by regex declared **inside each form spec**, not by a shared global lookup table, because `ABR-M` and `ABR-L` tick different cells on different forms and that fact belongs in the file describing that form.

Options that exist on the form but not in the catalog — the `220V` / `400V` / `415V` / `480V` voltage boxes — are driven by `productionSpec.voltage` rather than by a quote line.

### 6.3 PathWorks

`PTW(I)` (integrated) and `PTW(S)` (standalone) are two different orders, not a duplication.

- Quote contains `PTW(I)` → the modules `PDG` / `WPN` / `WPL` / `ANT-V5` / `ANT-V6` tick the PathWorks row **on the machine form**. No Software Order Form.
- Quote contains `PTW(S)` → a separate Software Order Form is produced (later iteration) and the machine form's PathWorks row stays empty.
- Modules present with neither `PTW(I)` nor `PTW(S)` → amber warning "PathWorks modules without a host". Does not block generation.

### 6.4 Unmapped lines

Options with no box on this form, `CUSTOM` lines, and services never appear on a machine form. They are collected onto a single **"Additional items"** sheet at the end of the PDF: name, quantity, short description, and which machine the entry came from. The machine form stays clean and nothing is silently dropped.

One sheet at the end rather than one after each form: a three-machine quote would otherwise interleave three part-empty sheets through the print stack, and the workshop hands out forms per machine — an extras page stapled between two forms is more likely to travel with the wrong one than a single page at the back.

For this to be possible the engine has to know which options a form actually covers, and a tick alone does not say that. Each option tick therefore declares the code pattern it consumes, and anything on the item that no pattern claimed is what lands on the sheet. Without this, an option the form has no box for would vanish silently — the single most dangerous failure this feature could have.

## 7. Rendering pipeline

```
Document (FINAL, QUOTE)
  └─ buildFormContext()            → { distributor, author, company, contact, delivery, items[] }
      └─ per item: resolveForm(item.code) → FormSpec | null
          ├─ null → item goes to "Additional items"
          └─ spec → patchWorkbook(template, spec, ctx) → xlsx bytes
                    → POST Gotenberg /forms/libreoffice/convert → 1-page PDF
  └─ "Additional items" (if any)   → React → Gotenberg /forms/chromium/convert → PDF
  └─ POST Gotenberg /forms/pdfengines/merge → single PDF
  └─ stream as Q-AU-2026-001-production-forms.pdf
```

No new infrastructure: the existing `gotenberg/gotenberg:8` container already provides the Chromium, LibreOffice and PDF-engines routes.

Every template already prints to exactly one A4 sheet — `paperSize 9`, portrait, an explicit `print_area`, and `fitToPage` / `scale 80–91`. The "one form, one A4 page" requirement is satisfied by the templates themselves, not by our layout code.

### 7.1 `patchWorkbook`

This function carries all of the fidelity risk and all of the fidelity guarantee.

Unzip the xlsx and modify **exactly one entry**, `xl/worksheets/sheet1.xml`. For each target cell, locate `<c r="G8" s="42"/>` and rewrite it as an inline string, preserving the style attribute:

```xml
<c r="G8" s="42" t="inlineStr"><is><t>Pathfinder Australia Pty Ltd</t></is></c>
```

Inline strings rather than shared strings: this avoids rewriting index references in `sharedStrings.xml` and the risk of shifting every other string in the workbook. Any existing `<v>` or `<f>` child is dropped.

Empty cells are frequently absent from the XML entirely. When a target cell does not exist, insert a new `<c>` at the correct position within its `<row>` in column order, creating the `<row>` itself if needed.

Every other entry in the archive — `styles.xml`, `drawing1.xml`, the four embedded images, `printerSettings1.bin`, the print area, `fitToPage` — is carried across content-identically. (The archive is repacked, so raw compressed bytes may differ; what is guaranteed, and what §11 tests, is that each entry's *decompressed content* is unchanged.) Fidelity is not achieved; it is simply never lost.

### 7.2 Caching

None. Forms are regenerated on every request. A FINAL quote is immutable and `productionSpec` is small, so generation is cheap and the output always reflects the current spec.

## 8. Step 0 — the spike — **PASSED 2026-09-01**

`M-series order 12.xlsx` was patched with a full set of `X` marks and header values and converted with headless LibreOffice — the same engine Gotenberg wraps.

**Result: exactly one A4 page (595.3 × 841.9 pt), every `X` inside its intended box, logos, frames, print area and scaling intact.** Century Gothic was substituted, as expected and accepted. Approach A stands; approach B is not needed.

Three coordinate errors were found and are corrected above:

1. **`M8` clipped the `Name:` label** to "Nam". The label sits in the 4.3-character-wide `L8` and depends on overflowing rightwards. The author name moved to `N8`.
2. **`E81` does not exist in the sheet XML at all** — Excel omits empty cells, so the patcher's insert path is real and not theoretical. The drills fields moved to `H81` (Yes/No) and `J82` (detail).
3. **Rows 81–82 overflow their frame.** They carry a large hand-writing font, and the drills and notes columns collide. Hence the caps in §5.1 — 22 and 28 characters — and notes being a single line.

The generic lesson, which applies to every form spec written from here on: a cell that looks blank next to a label may be the cell that label overflows into, and a "free area" is only as wide as the next occupied cell. Both are invisible in the spreadsheet and obvious in the rendered PDF, so **every new form spec gets one printed page checked by eye before it ships** — the contract test in §11 cannot see either problem.

## 9. UI

**Builder, inside each machine item card** — a collapsed "Production spec" panel rendering the fields of that series' Zod schema. The line chip (`Line 1 / 2 / 3`) appears in the same panel only when the document holds two or more machine items. Changing `ui` writes to every item in the same line and shows a toast naming what else was updated.

**Document page, `QUOTE` + `FINAL`** — a "Production forms" section:

```
M-Series M5220          ready              [PDF]
EasyLoader 2420         ready              [PDF]
FabricPro FP-220        missing: Voltage   [open in builder →]
Additional items (2)    ready              [PDF]

[ Download all forms (4 pages) ]     ← disabled while anything is missing
```

### 9.1 Industry picker

Industry is set on the client card — never by navigating to another page — through a combobox:

- **Typeahead.** Typing filters the list by substring, case-insensitively, as you type. The list is expected to hold hundreds of imported rows, so the field is search-first rather than a long scrolling `<select>`.
- **Create on miss.** When nothing matches, the last option is `Create "Marine upholstery"`. Choosing it creates the `Industry` row and selects it in one action.
- **Rename in place.** A pencil next to the selected value renames the `Industry` row itself. Because that row is shared, the confirm states how many companies are affected — `Rename "Automotve" to "Automotive"? Used by 14 companies.` Renaming is a genuine fix for an imported typo, so it stays available, but it never happens silently.
- **Clear.** The field is optional; clearing it sets `industryId` to null and the form prints the row blank.

Creation is case-insensitively deduplicated on the server: typing `automotive` when `Automotive` exists selects the existing row instead of creating a near-duplicate.

Bulk import runs through `scripts/import-industries.ts`, taking a newline-separated list and upserting by name, so re-running it is safe.

Production forms are offered on `QUOTE` documents only. An `INVOICE` — including one created from a quote — shows no forms section; the workshop is driven by the quote the client signed.

## 10. Error handling

| Situation | Behaviour |
|---|---|
| `requires` key missing (`ui`, `knifeSize`, `drills`) | Button disabled with the exact list of gaps, each linking to its item. The server revalidates and returns `422` with the same structured list. |
| Drills empty | Blocks. Mirrors the rule already printed on the form. |
| Quote contains only software or services | "No production forms apply to this quote" instead of a dead button. |
| PathWorks modules with no `PTW` host | Amber warning; does not block. |
| Gotenberg unreachable or timing out | `502` with a human message, matching the existing `/api/documents/[id]/pdf` route. |
| Template file missing, or a spec references an invalid cell | Caught by the contract test in §11, not in production. |

## 11. Testing

- **`patchWorkbook` unit tests.** Patch a fixture, re-read it, assert the values landed. Separately, hash every zip entry except `sheet1.xml` and assert none changed — a direct test of the claim that the design is preserved.
- **Resolution unit tests.** Product code → form. `ABR-M` ticks `F52` on M-Series while `ABR-L` ticks a different cell on L-Series. `PTW(I)` versus `PTW(S)`. Unmapped lines land on the Additional items sheet.
- **Spec contract test.** For every `FormSpec`: the template file exists and contains the declared sheet; every `ticks` and `values` cell is **empty** in the template; every `replaces` cell is **non-empty**. This catches the two dangerous typos — a tick aimed one row off into a cell that holds a printed label, and a `values` entry aimed at a label instead of the blank beside it.

  It does not verify that a tick cell is a bordered box; reading cell borders needs a styles-aware xlsx reader, and the repo's existing `xlsx` (SheetJS) dependency does not expose them reliably. Box coordinates are therefore confirmed once, visually, when a form spec is first written — that is part of what the §8 spike and each later form's manual check exist for.
- **Pipeline golden test.** A fixture quote with M + EL + FP produces a merged PDF of exactly three pages.
- **Manual visual check** as part of the §8 spike, and once more when each new form spec is added.

## 12. Deliberate omissions

- No production status tracking. A form is a printable artifact, not a state machine. If the workshop later needs statuses, a `ProductionOrder` entity can be layered on top without disturbing anything here.
- No `ProductionLine` table (§4.2).
- No industry admin screen. Rows are created inline or bulk-imported, and renamed inline. Deleting and merging industries are omitted until the imported list shows it is needed; an unused row is harmless.
- No editing of the form layouts in-app. Layout changes arrive as a new xlsx dropped into `templates/`, with the spec file adjusted if cells moved — the reason these files are versioned `12`, `13`, `05` in the first place.
