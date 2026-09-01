import { z } from "zod";

/**
 * An industry name as typed by a user. 80 characters is generous for the
 * imported list and keeps the value inside the `Industry:` cell on every
 * order form without overflow.
 */
export const industryNameSchema = z
  .string()
  .trim()
  .min(1, "Industry name is required")
  .max(80, "Industry name must be 80 characters or fewer");

/**
 * Comparison key for deduplication. Creating "automotive" when "Automotive"
 * already exists must select the existing row rather than add a near-
 * duplicate -- see `createIndustry`, and the Industry_name_lower_key
 * functional index that backs it in the database.
 */
export function normalizeIndustryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
