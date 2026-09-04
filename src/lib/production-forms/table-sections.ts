/**
 * An EasyLoader is a table built from physical 1.2 metre modules, and this
 * module is the single place that turns a drawn layout into the options the
 * customer is charged for.
 *
 * The direction used to run the other way: a manager picked table-length
 * options by hand, drew sections to match, and a reconciliation gate caught
 * the cases where the two disagreed. The owner's instruction is that the
 * layout is the input and the options are its consequence, so the gate is
 * gone -- not relaxed, but unnecessary, since a mismatch can no longer be
 * expressed.
 *
 * The rule that carries the price: a conveyor section needs a motor, and the
 * motor lives in its first module. So each conveyor section is one Drive
 * Module plus (n-1) plain 1.2m lengths. A static section has no motor at all
 * and is n static lengths. Two conveyor sections mean two drive modules --
 * they are two separate runs of table, each with its own drive.
 */

/** Every table option is priced and counted per 1.2 metre unit. */
export const SECTION_UNIT_M = 1.2;

/** The most sections one EasyLoader can be split into. Four by the owner's
 * instruction; note the printed order form still has three rows, so a fourth
 * section has nowhere to print until that template is redrawn. */
export const MAX_SECTIONS = 4;

export type SectionSurface = "static" | "conveyor";
export type Section = { lengthM: number; surface: SectionSurface };

/**
 * The option-code suffixes that follow the product code. Every EasyLoader
 * option is scoped to one width -- "EL-2420 Additional 1.2M lengths" -- and
 * the part after the code is identical across widths, so a derived code is
 * always `${itemCode} ${suffix}`.
 *
 * These strings must match `prisma/seed-data/catalog.json` exactly, and they
 * are long because the catalogue's own codes are the full descriptions. A
 * suffix that drifted would not be cosmetic: `setItemOptions` rejects a code
 * the catalogue does not have, so the table simply could not be saved.
 * tests/catalog.test.ts derives every kind for every width and checks the
 * catalogue has all of them.
 */
export const EL_OPTION_SUFFIX = {
  drive: "Drive Module (first 1.2M)",
  conveyor: "Additional 1.2M lengths",
  static: "Static table 1.2M lengths",
  busbar: "Electrical Busbar Per 1.2M Used for Fabric Pro automatic spreader.",
  rail: "Travel Platform support rail. Per 1.2m",
} as const;

export type ElOptionKind = keyof typeof EL_OPTION_SUFFIX;

/** The catalogue code for one of this item's derived options. */
export function elOptionCode(itemCode: string, kind: ElOptionKind): string {
  return `${itemCode} ${EL_OPTION_SUFFIX[kind]}`;
}

/**
 * Converts a whole number of 1.2m units to metres. A plain
 * `units * SECTION_UNIT_M` can land on 7.199999999999999 instead of 7.2;
 * every unit count here is a whole number of 1.2m lengths, so the true
 * value always has exactly one decimal digit -- round to it.
 */
export function unitsToM(units: number): number {
  return Math.round(units * SECTION_UNIT_M * 10) / 10;
}

/** How many 1.2m modules a section's length is. Rounded rather than divided
 * exactly: 1.2 has no exact binary representation, so a length assembled by
 * repeated addition can sit a hair off the true multiple. */
export function modulesIn(section: Section): number {
  return Math.max(0, Math.round(section.lengthM / SECTION_UNIT_M));
}

export type LayoutTotals = {
  /** One per conveyor section that has any modules at all. */
  driveModules: number;
  /** Conveyor modules after each section's first, which is its drive. */
  conveyorModules: number;
  staticModules: number;
  /** Every physical module, whatever it is -- what the busbar and the
   * travel-platform rail are counted per. */
  totalModules: number;
  totalM: number;
};

export function layoutTotals(sections: Section[]): LayoutTotals {
  let driveModules = 0;
  let conveyorModules = 0;
  let staticModules = 0;

  for (const section of sections) {
    const modules = modulesIn(section);
    if (modules === 0) continue;
    if (section.surface === "conveyor") {
      driveModules += 1;
      conveyorModules += modules - 1;
    } else {
      staticModules += modules;
    }
  }

  const totalModules = driveModules + conveyorModules + staticModules;
  return { driveModules, conveyorModules, staticModules, totalModules, totalM: unitsToM(totalModules) };
}

export type DerivedOption = { optionCode: string; qty: number };

/**
 * The option lines an EasyLoader's layout adds up to. Anything with a
 * quantity of zero is left out rather than written as a zero-quantity line,
 * so a table with no static run simply has no static row.
 *
 * `fabricProCompatible` adds the electrical busbar and the travel-platform
 * support rail, one of each per module -- including the static ones, which
 * the FabricPro still has to travel over.
 */
export function deriveEasyLoaderOptions(
  itemCode: string,
  sections: Section[],
  fabricProCompatible: boolean
): DerivedOption[] {
  const totals = layoutTotals(sections);
  const derived: DerivedOption[] = [];

  const push = (kind: ElOptionKind, qty: number) => {
    if (qty > 0) derived.push({ optionCode: elOptionCode(itemCode, kind), qty });
  };

  push("drive", totals.driveModules);
  push("conveyor", totals.conveyorModules);
  push("static", totals.staticModules);

  if (fabricProCompatible) {
    push("busbar", totals.totalModules);
    push("rail", totals.totalModules);
  }

  return derived;
}

/**
 * Every option code this item's layout owns. Used to tell the manager's own
 * selections (roll holder, sync feature, crate) apart from the derived rows
 * when rewriting them, and to render the derived rows read-only in the
 * options editor -- editing a number the builder recomputes on the next
 * click would only ever be undone.
 */
export function derivedEasyLoaderCodes(itemCode: string): Set<string> {
  return new Set(
    (Object.keys(EL_OPTION_SUFFIX) as ElOptionKind[]).map((kind) => elOptionCode(itemCode, kind))
  );
}

/** Whether `optionCode` is one `itemCode`'s layout owns. */
export function isDerivedEasyLoaderOption(itemCode: string, optionCode: string): boolean {
  return derivedEasyLoaderCodes(itemCode).has(optionCode);
}
