import { db } from "@/lib/db";

/**
 * Every industry, alphabetically. The picker filters client-side: the list
 * is expected to hold hundreds of imported rows, which is small enough to
 * ship whole and makes typeahead instant with no round trip per keystroke.
 */
export async function listIndustries() {
  return db.industry.findMany({ orderBy: { name: "asc" } });
}

/**
 * How many companies point at an industry. Shown in the rename confirmation
 * so a shared-row edit is never silent.
 */
export async function countCompaniesUsingIndustry(industryId: string): Promise<number> {
  return db.company.count({ where: { industryId } });
}
