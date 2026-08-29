import { db } from "@/lib/db";
import { companyWhereForUser, type ScopeUser } from "@/lib/scope";

export type CompanyListItem = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  regionCode: string;
  contactCount: number;
};

/**
 * Companies visible to `user` (all for ADMIN, own-only for MANAGER),
 * optionally filtered by a case-insensitive name search, ordered by name.
 * Each row carries its contact count and region code for the list cards.
 */
export async function listCompanies(
  user: ScopeUser,
  params: { q?: string } = {}
): Promise<CompanyListItem[]> {
  const { q } = params;

  const where: NonNullable<Parameters<typeof db.company.findMany>[0]>["where"] = {
    ...companyWhereForUser(user),
  };

  if (q && q.trim()) {
    where.name = { contains: q.trim(), mode: "insensitive" };
  }

  const companies = await db.company.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      region: true,
      _count: { select: { contacts: true } },
    },
  });

  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    country: c.country,
    regionCode: c.region.code,
    contactCount: c._count.contacts,
  }));
}

export type ContactDetail = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  isPrimary: boolean;
};

export type CompanyDetail = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  taxId: string | null;
  notes: string | null;
  regionCode: string;
  contacts: ContactDetail[];
};

/**
 * A single company (scoped to what `user` may access) with its contacts,
 * primary contact first then by first name. Returns `null` both when the
 * company doesn't exist and when it exists but is out of the caller's
 * scope (a MANAGER viewing another manager's company) — callers should
 * treat both the same way (404), never distinguishing them.
 */
export async function getCompanyDetail(
  user: ScopeUser,
  companyId: string
): Promise<CompanyDetail | null> {
  const company = await db.company.findFirst({
    where: { id: companyId, ...companyWhereForUser(user) },
    include: {
      region: true,
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }],
      },
    },
  });
  if (!company) return null;

  return {
    id: company.id,
    name: company.name,
    street: company.street,
    city: company.city,
    state: company.state,
    postcode: company.postcode,
    country: company.country,
    taxId: company.taxId,
    notes: company.notes,
    regionCode: company.region.code,
    contacts: company.contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      position: c.position,
      isPrimary: c.isPrimary,
    })),
  };
}
