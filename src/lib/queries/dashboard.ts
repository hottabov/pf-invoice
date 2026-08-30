import { db } from "@/lib/db";
import { companyWhereForUser, documentWhereForUser, type ScopeUser } from "@/lib/scope";

export type DashboardCounts = {
  documents: number;
  drafts: number;
  clients: number;
};

/**
 * Cheap counts for the dashboard's nav cards: total documents visible to
 * `user` (scoped exactly like `listDocuments`), how many of those are still
 * DRAFT, and total clients (scoped like `listCompanies`). Three independent
 * `count()` calls rather than one aggregate query, so each stays scoped
 * identically to its list-page counterpart without duplicating that
 * filtering logic here.
 */
export async function countsForDashboard(user: ScopeUser): Promise<DashboardCounts> {
  const documentWhere = documentWhereForUser(user);

  const [documents, drafts, clients] = await Promise.all([
    db.document.count({ where: documentWhere }),
    db.document.count({ where: { ...documentWhere, status: "DRAFT" } }),
    db.company.count({ where: companyWhereForUser(user) }),
  ]);

  return { documents, drafts, clients };
}
