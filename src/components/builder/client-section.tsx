"use client";

import { useMemo, useState, useTransition } from "react";
import { inputClass } from "@/components/catalog/field";
import type { ActionResult } from "@/lib/actions/documents";
import type { ClientPickerCompany } from "@/lib/queries/documents";

/**
 * The builder's "Client" section: a search box over every company `user`
 * can see (preloaded in full server-side — companies are a small list, so a
 * client-side filter is simpler than a per-keystroke server round trip),
 * then a company select and — once a company with contacts is chosen — a
 * contact select. Every change calls `setClientAction` directly (no
 * <form>, same pattern as the "make primary" star in
 * src/components/clients/contacts-section.tsx) so picking a client is a
 * single tap with no separate "save" step.
 */
export function ClientSection({
  documentId,
  companies,
  initialCompanyId,
  initialContactId,
  setClientAction,
  readOnly = false,
}: {
  documentId: string;
  companies: ClientPickerCompany[];
  initialCompanyId: string | null;
  initialContactId: string | null;
  setClientAction: (
    documentId: string,
    companyId: string,
    contactId: string | null
  ) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const [contactId, setContactId] = useState(initialContactId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filteredCompanies = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(term));
  }, [companies, query]);

  const selectedCompany = companies.find((c) => c.id === companyId) ?? null;

  function runSetClient(nextCompanyId: string, nextContactId: string) {
    setError(null);
    startTransition(async () => {
      const result = await setClientAction(documentId, nextCompanyId, nextContactId || null);
      if (result?.error) setError(result.error);
    });
  }

  function handleCompanyChange(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setContactId("");
    if (nextCompanyId) runSetClient(nextCompanyId, "");
  }

  function handleContactChange(nextContactId: string) {
    setContactId(nextContactId);
    if (companyId) runSetClient(companyId, nextContactId);
  }

  return (
    <section className="rounded-xl border border-border bg-white p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-brand-dark">Client</h2>
        {!readOnly && (
          <a
            href="/clients/new"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-brand hover:underline"
          >
            + New company
          </a>
        )}
      </div>

      {readOnly ? (
        <p className="mt-3 text-sm text-foreground">{selectedCompany?.name ?? "No client set"}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies…"
            className={inputClass}
            disabled={pending}
          />

          <select
            aria-label="Company"
            value={companyId}
            onChange={(e) => handleCompanyChange(e.target.value)}
            className={inputClass}
            disabled={pending}
          >
            <option value="">Select a company…</option>
            {filteredCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {selectedCompany && selectedCompany.contacts.length > 0 ? (
            <select
              aria-label="Contact"
              value={contactId}
              onChange={(e) => handleContactChange(e.target.value)}
              className={inputClass}
              disabled={pending}
            >
              <option value="">No contact selected</option>
              {selectedCompany.contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
                  {contact.isPrimary ? " (primary)" : ""}
                </option>
              ))}
            </select>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
