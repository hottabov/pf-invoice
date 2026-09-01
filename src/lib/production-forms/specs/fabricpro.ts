import { fabricProSpecSchema } from "@/lib/validation/production-spec";
import type { FormContext, FormSpec } from "../types";

/** FP-TROLLEY is deliberately excluded: it has its own form, out of scope. */
const CODE = /^FP-(180|220|300)$/;

const modelCell = (code: string) => ({ "FP-180": "H27", "FP-220": "J27", "FP-300": "M27" })[code];
const spec = (key: string, want: string) => (ctx: FormContext) => ctx.item.spec[key] === want;

export const fabricProSpec: FormSpec = {
  id: "fabricpro",
  title: "Fabric Pro Order Form",
  template: "fabric-pro-order-form-08.xlsx",
  sheetPath: "xl/worksheets/sheet1.xml",
  matches: (code) => CODE.test(code),
  specSchema: fabricProSpecSchema,
  requires: ["ui"],

  values: [
    { cell: "G10", from: (c) => c.distributorName },
    // O10, not N10: "Name:" in M10 needs N10 to overflow into, or it clips
    // to "Nam". Same trap as M-Series at M8 and EasyLoader at N11.
    { cell: "O10", from: (c) => c.authorName },
    // H14 is the Company line -- borderless because the rule under it is
    // H15's top border. H15-H17 are the three Address lines.
    { cell: "H14", from: (c) => c.company.name },
    { cell: "H15", from: (c) => c.company.addressLines[0] },
    { cell: "H16", from: (c) => c.company.addressLines[1] },
    { cell: "H17", from: (c) => c.company.addressLines[2] },
    { cell: "H18", from: (c) => c.contact.fullName },
    { cell: "H19", from: (c) => c.contact.position },
    { cell: "H20", from: (c) => c.contact.phone },
    { cell: "H22", from: (c) => c.contact.email },
    { cell: "H23", from: (c) => c.company.industry },
    { cell: "O15", from: (c) => c.deliveryAddressLines[0] },
    { cell: "O16", from: (c) => c.deliveryAddressLines[1] },
    { cell: "O17", from: (c) => c.deliveryAddressLines[2] },
    { cell: "N46", from: (c) => c.item.spec.railLengthM as number | undefined },
    { cell: "N48", from: (c) => c.item.spec.powerRailLengthM as number | undefined },
  ],

  replaces: [],

  ticks: [
    { cell: "H27", when: (c) => modelCell(c.item.code) === "H27" },
    { cell: "J27", when: (c) => modelCell(c.item.code) === "J27" },
    { cell: "M27", when: (c) => modelCell(c.item.code) === "M27" },

    // The form prints one voltage and notes it is the only one available.
    { cell: "H35", when: () => true },

    { cell: "J41", when: spec("ui", "-Y") },
    { cell: "O41", when: spec("ui", "+Y") },

    { cell: "J44", when: (c) => c.item.spec.travelPlatform === true },
    { cell: "J46", when: (c) => Boolean(c.item.spec.railLengthM) },
    { cell: "J48", when: (c) => Boolean(c.item.spec.powerRailLengthM) },

    { cell: "D58", when: (c) => c.item.spec.exWorks === true },
    { cell: "D68", when: (c) => c.item.spec.crate === true },
  ],
};
