import { z } from "zod";

/**
 * Operator-screen side. Shared by every machine that has one, because a
 * cutter and its spreaders must agree -- see `lineGroup` in schema.prisma.
 */
export const screenSideSchema = z.enum(["+Y", "-Y"]);

/**
 * Drills. The printed form says `"TBC" is not acceptable`, so "required with
 * no detail" is not a valid state -- either there are no drills, or their
 * quantity, type and size are written down.
 */
export const drillsSchema = z
  .object({
    required: z.boolean(),
    detail: z.string().trim().max(22, "Drill detail must be 22 characters or fewer"),
  })
  .refine((value) => !value.required || value.detail.length > 0, {
    message: "Specify drill quantity, type and size",
    path: ["detail"],
  });

/**
 * The two free-text areas on the M-Series form are tall single rows with no
 * empty cells to their right, so text cannot overflow the way an address
 * line does -- it would simply be clipped. Hence the hard caps.
 */
export const mSeriesSpecSchema = z.object({
  ui: screenSideSchema,
  knifeSize: z.enum(["1.5x5.0", "1.5x7.0", "2.0x7.0"]),
  voltage: z.enum(["220V", "400V", "415V", "480V"]).optional(),
  drills: drillsSchema,
  specialNotes: z.string().trim().max(28, "Special notes must be 28 characters or fewer").optional(),
});

export const easyLoaderSpecSchema = z.object({
  ui: screenSideSchema,
  usage: z.enum(["onload", "offload"]),
  customWidthMm: z.number().int().positive().max(9999).optional(),
  sections: z
    .array(z.object({ lengthM: z.number().positive().max(99), surface: z.enum(["static", "conveyor"]) }))
    .max(3),
  rollFeed: z
    .object({ qty: z.number().int().min(1).max(4), distancesMm: z.array(z.number().int().min(0)).max(4) })
    .optional(),
  paperRollHolder: z.boolean().optional(),
  crate: z.boolean().optional(),
});

export const fabricProSpecSchema = z.object({
  ui: screenSideSchema,
  travelPlatform: z.boolean(),
  railLengthM: z.number().positive().max(99).optional(),
  powerRailLengthM: z.number().positive().max(99).optional(),
  exWorks: z.boolean().optional(),
  crate: z.boolean().optional(),
});

export type MSeriesSpec = z.infer<typeof mSeriesSpecSchema>;
export type EasyLoaderSpec = z.infer<typeof easyLoaderSpecSchema>;
export type FabricProSpec = z.infer<typeof fabricProSpecSchema>;

/**
 * Which of a form's `requires` keys are not yet answered. Drives both the
 * disabled download button and the 422 the route returns, so the UI and the
 * server can never disagree about what is missing.
 *
 * Two keys need more than a presence check: `drills` is satisfied by an
 * explicit "no drills", and `sections` is not satisfied by an empty array.
 */
export function missingKeys(spec: unknown, required: string[]): string[] {
  const record = (spec ?? {}) as Record<string, unknown>;

  return required.filter((key) => {
    const value = record[key];
    if (value === undefined || value === null) return true;

    if (key === "drills") {
      const drills = value as { required?: boolean; detail?: string };
      if (drills.required === false) return false;
      return !drills.detail || drills.detail.trim().length === 0;
    }

    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "string") return value.trim().length === 0;

    return false;
  });
}
