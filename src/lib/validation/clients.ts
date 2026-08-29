// Pure zod validation for the clients editors (companies and contacts). No
// imports from `@/lib/db` or any Prisma types — this module must be safely
// importable from a plain unit test and from the server actions that call
// it. Mirrors the style of src/lib/validation/catalog.ts.
import { z } from "zod";

// --- shared field pieces -----------------------------------------------

const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(200, "Name must be at most 200 characters");

/** Optional free text that collapses missing/blank input to `undefined`. */
function optionalText(max: number, label: string) {
  return z.preprocess(
    (value) =>
      value === null || value === undefined || (typeof value === "string" && value.trim() === "")
        ? undefined
        : value,
    z.string().max(max, `${label} must be at most ${max} characters`).optional()
  );
}

const streetSchema = optionalText(120, "Street");
const citySchema = optionalText(120, "City");
const stateSchema = optionalText(120, "State");
const postcodeSchema = optionalText(20, "Postcode");
const countrySchema = optionalText(120, "Country");
const taxIdSchema = optionalText(50, "Tax ID");
const notesSchema = optionalText(2000, "Notes");

const regionCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{2,3}$/.test(value), {
    message: "Region code must be 2-3 letters",
  });

// --- company -------------------------------------------------------------

export const companySchema = z.object({
  name: nameSchema,
  street: streetSchema,
  city: citySchema,
  state: stateSchema,
  postcode: postcodeSchema,
  country: countrySchema,
  taxId: taxIdSchema,
  notes: notesSchema,
  regionCode: regionCodeSchema,
});

export type CompanyInput = z.infer<typeof companySchema>;

// --- contact ---------------------------------------------------------------

const firstNameSchema = z
  .string()
  .trim()
  .min(1, "First name is required")
  .max(80, "First name must be at most 80 characters");

const lastNameSchema = optionalText(80, "Last name");

/** Optional email: missing/blank collapses to `undefined`; otherwise must
 * be a valid email address. */
const emailSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
      ? undefined
      : value,
  z.email("Must be a valid email address").optional()
);

const phoneSchema = optionalText(40, "Phone");
const positionSchema = optionalText(80, "Position");

const isPrimarySchema = z.preprocess(
  (value) => value === "on" || value === true || value === "true" || value === "1",
  z.boolean()
);

export const contactSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  position: positionSchema,
  isPrimary: isPrimarySchema,
});

export type ContactInput = z.infer<typeof contactSchema>;
