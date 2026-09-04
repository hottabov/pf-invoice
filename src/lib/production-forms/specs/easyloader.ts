import { easyLoaderSpecSchema } from "@/lib/validation/production-spec";
import { layoutTotals } from "../table-sections";
import type { FormContext, FormSpec } from "../types";

const CODE = /^EL-\d{4}$/;
/** Only these two have a printed box; everything else ticks Custom. */
const PRINTED_WIDTHS: Record<string, string> = { "EL-2020": "I31", "EL-2420": "I33" };

type Section = { lengthM: number; surface: "static" | "conveyor" };

const sections = (ctx: FormContext) => (ctx.item.spec.sections ?? []) as Section[];
const spec = (key: string, want: string) => (ctx: FormContext) => ctx.item.spec[key] === want;

/**
 * An option tick. `covers` records the same pattern so `unmatchedOptionCodes`
 * knows this form has a box for it -- without it, the crate and roll holder
 * would be reported as unmapped and printed a second time on the
 * "Additional items" sheet. Mirrors the helper in specs/m-series.ts.
 */
const optionTick = (cell: string, pattern: RegExp) => ({
  cell,
  when: (ctx: FormContext) => ctx.item.optionCodes.some((code) => pattern.test(code)),
  covers: pattern,
});

/** Length value box and the two surface tick boxes, per table section. */
const SECTION_CELLS = [
  { length: "I43", static: "I45", conveyor: "K45" },
  { length: "I47", static: "I49", conveyor: "K49" },
  { length: "I51", static: "I53", conveyor: "K53" },
];

export const easyLoaderSpec: FormSpec = {
  id: "easyloader",
  title: "EasyLoader Order Form",
  template: "easy-loader-13.xlsx",
  sheetPath: "xl/worksheets/sheet1.xml",
  matches: (code) => CODE.test(code),
  specSchema: easyLoaderSpecSchema,
  // "ui" is not listed: screenSideSchema defaults to -Y, so it can never be
  // missing. "sections" is not listed either: an empty array legitimately
  // means one undivided table -- see easyLoaderSpecSchema. What gates
  // finalize is reconciling the layout against the options sold (Task 5),
  // not the presence of this field.
  requires: ["usage"],

  // The options the table layout is made of have no box of their own: the
  // section rows and the "Total Table is N m" line at M54 are how this form
  // states them. Declaring them here keeps them off the Additional items
  // sheet, which exists for things the form genuinely cannot express. The
  // busbar and the support rail are here for the same reason -- they are one
  // per module of a table the form already draws.
  coversOptions: [
    /Drive Module \(first 1\.2M\)$/i,
    /Additional 1\.2M lengths$/i,
    /Static table 1\.2M lengths$/i,
    /Electrical Busbar Per 1\.2M/i,
    /Travel Platform support rail\. Per 1\.2m$/i,
  ],

  values: [
    { cell: "G11", from: (c) => c.distributorName },
    // O11, not N11: the "Name:" label sits in M11, which is 3.7 characters
    // wide, so it needs N11 to overflow into. Writing there clips it to
    // "Nam" -- the same trap the M-Series map fell into at M8.
    { cell: "O11", from: (c) => c.authorName },
    // H15 is the Company line: it looks borderless because the rule under it
    // is drawn as H16's top border. H16-H18 are the three Address lines.
    { cell: "H15", from: (c) => c.company.name },
    { cell: "H16", from: (c) => c.company.addressLines[0] },
    { cell: "H17", from: (c) => c.company.addressLines[1] },
    { cell: "H18", from: (c) => c.company.addressLines[2] },
    { cell: "H19", from: (c) => c.contact.fullName },
    { cell: "H20", from: (c) => c.contact.position },
    { cell: "H21", from: (c) => c.contact.phone },
    { cell: "H23", from: (c) => c.contact.email },
    { cell: "H24", from: (c) => c.company.industry },
    { cell: "O16", from: (c) => c.deliveryAddressLines[0] },
    { cell: "O17", from: (c) => c.deliveryAddressLines[1] },
    { cell: "O18", from: (c) => c.deliveryAddressLines[2] },
    ...SECTION_CELLS.map((cells, index) => ({
      cell: cells.length,
      from: (c: FormContext) => sections(c)[index]?.lengthM,
    })),
    { cell: "F61", from: (c) => (c.item.spec.rollFeed as { qty?: number })?.qty },
    ...["K61", "K63", "K65", "K67"].map((cell, index) => ({
      cell,
      from: (c: FormContext) =>
        (c.item.spec.rollFeed as { distancesMm?: number[] })?.distancesMm?.[index],
    })),
    // M54 is blank in the template, in the same notes column as the three
    // "(Multiple of 1.2m...)" annotations, one row below section 3. The
    // total is added up from the sections rather than typed -- it is the one
    // place any form prints something the paper form never had, but the
    // workshop otherwise has to add up the section boxes by hand to get it.
    // Omitted entirely for an empty table: printing "Total Table is 0 m" is
    // worse than printing nothing.
    {
      cell: "M54",
      from: (c) => {
        const totalM = layoutTotals(sections(c)).totalM;
        return totalM > 0 ? `Total Table is ${totalM} m` : null;
      },
    },
  ],

  // J35 holds the printed label "  Custom     ___________mm". There is no
  // blank beside it, so the whole label is rewritten. This is the only place
  // in any spec that overwrites printed text -- hence its own field.
  replaces: [
    {
      cell: "J35",
      from: (c) => {
        const width = c.item.spec.customWidthMm as number | undefined;
        return width ? `  Custom     ${width}mm` : null;
      },
    },
  ],

  ticks: [
    { cell: "I31", when: (c) => PRINTED_WIDTHS[c.item.code] === "I31" },
    { cell: "I33", when: (c) => PRINTED_WIDTHS[c.item.code] === "I33" },
    { cell: "I35", when: (c) => PRINTED_WIDTHS[c.item.code] === undefined },

    { cell: "I38", when: spec("usage", "onload") },
    { cell: "O38", when: spec("usage", "offload") },
    { cell: "I40", when: spec("ui", "-Y") },
    { cell: "O40", when: spec("ui", "+Y") },

    ...SECTION_CELLS.flatMap((cells, index) => [
      { cell: cells.static, when: (c: FormContext) => sections(c)[index]?.surface === "static" },
      { cell: cells.conveyor, when: (c: FormContext) => sections(c)[index]?.surface === "conveyor" },
    ]),

    optionTick("D56", /Syncronisation/i),
    { cell: "D59", when: (c) => Boolean(c.item.spec.rollFeed) },
    // The perforated paper roll holder's catalog code differs per width and
    // is inconsistent about it: "EL-2020 #ST620-2020 Roll Holder..." carries
    // a stray "#" that "EL-2420 ST620-2420 Roll Holder..." does not. Match on
    // "Roll Holder" rather than trying to be precise about the prefix.
    optionTick("D69", /Roll Holder/i),
    optionTick("D71", /^Crate-EL$/),
  ],
};
