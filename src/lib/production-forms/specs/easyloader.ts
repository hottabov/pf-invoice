import { easyLoaderSpecSchema } from "@/lib/validation/production-spec";
import type { FormContext, FormSpec } from "../types";

const CODE = /^EL-\d{4}$/;
/** Only these two have a printed box; everything else ticks Custom. */
const PRINTED_WIDTHS: Record<string, string> = { "EL-2020": "I31", "EL-2420": "I33" };

type Section = { lengthM: number; surface: "static" | "conveyor" };

const sections = (ctx: FormContext) => (ctx.item.spec.sections ?? []) as Section[];
const spec = (key: string, want: string) => (ctx: FormContext) => ctx.item.spec[key] === want;

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
  requires: ["ui", "usage", "sections"],

  values: [
    { cell: "G11", from: (c) => c.distributorName },
    { cell: "N11", from: (c) => c.authorName },
    { cell: "H16", from: (c) => c.company.name },
    { cell: "H17", from: (c) => c.company.addressLines[0] },
    { cell: "H18", from: (c) => c.company.addressLines[1] },
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

    { cell: "D56", when: (c) => /Syncronisation/i.test(c.item.optionCodes.join("|")), covers: /Syncronisation/i },
    { cell: "D59", when: (c) => Boolean(c.item.spec.rollFeed) },
    { cell: "D69", when: (c) => c.item.spec.paperRollHolder === true },
    { cell: "D71", when: (c) => c.item.spec.crate === true },
  ],
};
