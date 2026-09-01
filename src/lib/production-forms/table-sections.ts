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

/**
 * Converts a whole number of 1.2m units to metres. A plain
 * `units * SECTION_UNIT_M` can land on 7.199999999999999 instead of 7.2;
 * every unit count here is a whole number of 1.2m lengths, so the true
 * value always has exactly one decimal digit -- round to it.
 */
function unitsToM(units: number): number {
  return Math.round(units * SECTION_UNIT_M * 10) / 10;
}

export function tableLengthsFromOptions(options: OptionQty[]): SoldTable {
  let conveyorUnits = 0;
  let staticUnits = 0;

  for (const option of options) {
    if (CONVEYOR_OPTION.test(option.code)) conveyorUnits += option.qty;
    else if (STATIC_OPTION.test(option.code)) staticUnits += option.qty;
  }

  return {
    conveyorUnits,
    staticUnits,
    totalM: unitsToM(conveyorUnits + staticUnits),
  };
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
        `Conveyor sections total ${unitsToM(used.conveyorUnits)}m but ${unitsToM(sold.conveyorUnits)}m was sold`,
      );
    }
    if (remaining.staticUnits !== 0) {
      problems.push(
        `Static sections total ${unitsToM(used.staticUnits)}m but ${unitsToM(sold.staticUnits)}m was sold`,
      );
    }
  }

  return { ok: problems.length === 0, sold, remaining, problems };
}
