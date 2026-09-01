"use client";

import { useMemo, useState, useTransition } from "react";
import { Building2, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldRow, SectionCard, fieldInputClass, CountrySelect, useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";
import type {
  CompanyInlineInput,
  ContactInlineInput,
  CreateCompanyInlineResult,
  CreateContactInlineResult,
} from "@/lib/actions/clients";
import type { ClientPickerCompany } from "@/lib/queries/documents";

export type RegionOption = { code: string; name: string };

type CompanyFormState = {
  name: string;
  regionCode: string;
  city: string;
  country: string;
  website: string;
  street: string;
  state: string;
  postcode: string;
  taxId: string;
  deliverySameAsMain: boolean;
  deliveryStreet: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPostcode: string;
  deliveryCountry: string;
  deliveryContactName: string;
  deliveryPhone: string;
};

type ContactFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position: string;
};

const EMPTY_CONTACT_FORM: ContactFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  position: "",
};

/**
 * The builder's "Client" section: a search box over every company `user`
 * can see (preloaded in full server-side — companies are a small list, so a
 * client-side filter is simpler than a per-keystroke server round trip),
 * then a company select and — once a company with contacts is chosen — a
 * contact select. Every change calls `setClientAction` directly (no
 * <form>, same pattern as the "make primary" star in
 * src/components/clients/contacts-section.tsx) so picking a client is a
 * single tap with no separate "save" step. Once a company is selected it
 * collapses to a small summary card with a "Change" action, so the picker
 * itself only reappears when actually switching clients.
 *
 * "+ New company" / "+ New contact" open an inline panel right here
 * (`createCompanyInlineAction`/`createContactInlineAction` — the
 * JSON-friendly siblings of the /clients forms' actions, see
 * src/lib/actions/clients.ts) instead of navigating to /clients/new: a
 * manager building a quote for a client that doesn't exist yet never has
 * to leave the document. On success the new entity is appended to the
 * local company list (kept in state precisely so this doesn't need a
 * server round trip to reflect), auto-selected, and immediately applied
 * to the document via `setClientAction` — same as picking an existing
 * company/contact from the selects. These two panels keep an explicit
 * "Create" button (creation is an intentional trigger, unlike an edit) —
 * everything else in the builder that got autosaved keeps that button
 * gone (see item-discount-field.tsx, document-discount-field.tsx,
 * notes-section.tsx).
 */
export function ClientSection({
  documentId,
  companies,
  initialCompanyId,
  initialContactId,
  setClientAction,
  createCompanyInlineAction,
  createContactInlineAction,
  regions,
  defaultRegionCode,
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
  createCompanyInlineAction: (input: CompanyInlineInput) => Promise<CreateCompanyInlineResult>;
  createContactInlineAction: (
    companyId: string,
    input: ContactInlineInput
  ) => Promise<CreateContactInlineResult>;
  regions: RegionOption[];
  defaultRegionCode: string;
  readOnly?: boolean;
}) {
  const toast = useToast();
  const [localCompanies, setLocalCompanies] = useState<ClientPickerCompany[]>(companies);
  const [query, setQuery] = useState("");
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const [contactId, setContactId] = useState(initialContactId ?? "");
  const [picking, setPicking] = useState(!initialCompanyId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [showMoreCompanyFields, setShowMoreCompanyFields] = useState(false);
  const [companyForm, setCompanyForm] = useState<CompanyFormState>(() => ({
    name: "",
    regionCode: defaultRegionCode,
    city: "",
    country: "",
    website: "",
    street: "",
    state: "",
    postcode: "",
    taxId: "",
    deliverySameAsMain: true,
    deliveryStreet: "",
    deliveryCity: "",
    deliveryState: "",
    deliveryPostcode: "",
    deliveryCountry: "",
    deliveryContactName: "",
    deliveryPhone: "",
  }));
  const [companyFormPending, setCompanyFormPending] = useState(false);
  const [companyFormError, setCompanyFormError] = useState<string | null>(null);

  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState<ContactFormState>(EMPTY_CONTACT_FORM);
  const [contactFormPending, setContactFormPending] = useState(false);
  const [contactFormError, setContactFormError] = useState<string | null>(null);

  const filteredCompanies = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return localCompanies;
    return localCompanies.filter((c) => c.name.toLowerCase().includes(term));
  }, [localCompanies, query]);

  const selectedCompany = localCompanies.find((c) => c.id === companyId) ?? null;

  function runSetClient(nextCompanyId: string, nextContactId: string) {
    setError(null);
    startTransition(async () => {
      const result = await setClientAction(documentId, nextCompanyId, nextContactId || null);
      if (result?.error) setError(result.error);
    });
  }

  function handleCompanyChange(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    // Mirror the server's auto-primary-contact resolution (setDocumentClient)
    // for an immediate UI reflection: `contacts` is already ordered isPrimary
    // desc, firstName asc (see listClientPickerCompanies), so [0] is exactly
    // the contact the server will assign when no contactId is submitted.
    const nextCompany = localCompanies.find((c) => c.id === nextCompanyId) ?? null;
    const autoContactId = nextCompany?.contacts[0]?.id ?? "";
    setContactId(autoContactId);
    if (nextCompanyId) {
      runSetClient(nextCompanyId, "");
      setPicking(false);
      setQuery("");
      setShowContactForm(false);
    }
  }

  function handleContactChange(nextContactId: string) {
    setContactId(nextContactId);
    if (companyId) runSetClient(companyId, nextContactId);
  }

  function resetCompanyForm() {
    setCompanyForm({
      name: "",
      regionCode: defaultRegionCode,
      city: "",
      country: "",
      website: "",
      street: "",
      state: "",
      postcode: "",
      taxId: "",
      deliverySameAsMain: true,
      deliveryStreet: "",
      deliveryCity: "",
      deliveryState: "",
      deliveryPostcode: "",
      deliveryCountry: "",
      deliveryContactName: "",
      deliveryPhone: "",
    });
    setShowMoreCompanyFields(false);
  }

  function closeCompanyForm() {
    setShowCompanyForm(false);
    setCompanyFormError(null);
    resetCompanyForm();
  }

  function closeContactForm() {
    setShowContactForm(false);
    setContactFormError(null);
    setContactForm(EMPTY_CONTACT_FORM);
  }

  async function handleCreateCompany() {
    setCompanyFormError(null);
    setCompanyFormPending(true);
    const result = await createCompanyInlineAction({
      name: companyForm.name,
      regionCode: companyForm.regionCode,
      website: companyForm.website,
      city: companyForm.city,
      country: companyForm.country,
      street: companyForm.street,
      state: companyForm.state,
      postcode: companyForm.postcode,
      taxId: companyForm.taxId,
      deliverySameAsMain: companyForm.deliverySameAsMain,
      deliveryStreet: companyForm.deliveryStreet,
      deliveryCity: companyForm.deliveryCity,
      deliveryState: companyForm.deliveryState,
      deliveryPostcode: companyForm.deliveryPostcode,
      deliveryCountry: companyForm.deliveryCountry,
      deliveryContactName: companyForm.deliveryContactName,
      deliveryPhone: companyForm.deliveryPhone,
    });
    setCompanyFormPending(false);

    if ("error" in result) {
      setCompanyFormError(result.error);
      return;
    }

    const newCompany: ClientPickerCompany = { id: result.company.id, name: result.company.name, contacts: [] };
    setLocalCompanies((prev) => [...prev, newCompany].sort((a, b) => a.name.localeCompare(b.name)));
    setCompanyId(result.company.id);
    setContactId("");
    setPicking(false);
    setQuery("");
    closeCompanyForm();
    runSetClient(result.company.id, "");
    toast.success(`${result.company.name} created`);
  }

  async function handleCreateContact() {
    if (!companyId) return;
    setContactFormError(null);
    setContactFormPending(true);
    const result = await createContactInlineAction(companyId, {
      firstName: contactForm.firstName,
      lastName: contactForm.lastName,
      email: contactForm.email,
      phone: contactForm.phone,
      position: contactForm.position,
    });
    setContactFormPending(false);

    if ("error" in result) {
      setContactFormError(result.error);
      return;
    }

    const trimmedFirstName = contactForm.firstName.trim();
    const trimmedLastName = contactForm.lastName.trim();
    setLocalCompanies((prev) =>
      prev.map((c) =>
        c.id === companyId
          ? {
              ...c,
              contacts: [
                ...c.contacts,
                {
                  id: result.contact.id,
                  firstName: trimmedFirstName,
                  lastName: trimmedLastName || null,
                  isPrimary: c.contacts.length === 0,
                },
              ],
            }
          : c
      )
    );
    setContactId(result.contact.id);
    closeContactForm();
    runSetClient(companyId, result.contact.id);
    toast.success(`${result.contact.label} created`);
  }

  return (
    <SectionCard
      title="Client"
      actions={
        !readOnly ? (
          <button
            type="button"
            onClick={() => (showCompanyForm ? closeCompanyForm() : setShowCompanyForm(true))}
            disabled={pending}
            className="focus-ring rounded-md text-xs font-medium text-brand hover:underline"
          >
            {showCompanyForm ? "Cancel" : "+ New company"}
          </button>
        ) : undefined
      }
    >
      {readOnly ? (
        <p className="text-sm text-slate-700">{selectedCompany?.name ?? "No client set"}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {selectedCompany && !picking ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-brand-dark">{selectedCompany.name}</p>
                  <p className="text-xs text-slate-500">
                    {selectedCompany.contacts.length === 0
                      ? "No contacts on file"
                      : `${selectedCompany.contacts.length} contact${selectedCompany.contacts.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPicking(true)}
                disabled={pending}
                className="focus-ring shrink-0 rounded-md text-xs font-medium text-brand hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search companies…"
                  aria-label="Search companies"
                  className={cn(fieldInputClass, "pl-9")}
                  disabled={pending}
                />
              </div>

              <select
                aria-label="Company"
                value={companyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className={fieldInputClass}
                disabled={pending}
              >
                <option value="">Select a company…</option>
                {filteredCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showCompanyForm ? (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FieldRow label="Company name" htmlFor="inline-company-name" required>
                  <input
                    id="inline-company-name"
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                    maxLength={200}
                    disabled={companyFormPending}
                    className={fieldInputClass}
                  />
                </FieldRow>
                <FieldRow label="Region" htmlFor="inline-company-region" required>
                  <select
                    id="inline-company-region"
                    value={companyForm.regionCode}
                    onChange={(e) => setCompanyForm((f) => ({ ...f, regionCode: e.target.value }))}
                    disabled={companyFormPending}
                    className={fieldInputClass}
                  >
                    {regions.length === 0 && <option value="">No regions configured</option>}
                    {regions.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name} ({r.code})
                      </option>
                    ))}
                  </select>
                </FieldRow>
                <FieldRow label="City" htmlFor="inline-company-city">
                  <input
                    id="inline-company-city"
                    value={companyForm.city}
                    onChange={(e) => setCompanyForm((f) => ({ ...f, city: e.target.value }))}
                    maxLength={120}
                    disabled={companyFormPending}
                    className={fieldInputClass}
                  />
                </FieldRow>
                <FieldRow label="Country" htmlFor="inline-company-country">
                  <CountrySelect
                    id="inline-company-country"
                    value={companyForm.country}
                    onChange={(value) => setCompanyForm((f) => ({ ...f, country: value }))}
                    disabled={companyFormPending}
                  />
                </FieldRow>
                <FieldRow label="Website" htmlFor="inline-company-website" className="sm:col-span-2">
                  <input
                    id="inline-company-website"
                    value={companyForm.website}
                    onChange={(e) => setCompanyForm((f) => ({ ...f, website: e.target.value }))}
                    placeholder="https://example.com"
                    maxLength={200}
                    disabled={companyFormPending}
                    className={fieldInputClass}
                  />
                </FieldRow>
              </div>

              <button
                type="button"
                onClick={() => setShowMoreCompanyFields((s) => !s)}
                className="focus-ring w-fit text-xs font-medium text-brand hover:underline"
              >
                {showMoreCompanyFields ? "Fewer fields" : "More fields"}
              </button>

              {showMoreCompanyFields ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FieldRow label="Street" htmlFor="inline-company-street">
                    <input
                      id="inline-company-street"
                      value={companyForm.street}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, street: e.target.value }))}
                      maxLength={120}
                      disabled={companyFormPending}
                      className={fieldInputClass}
                    />
                  </FieldRow>
                  <FieldRow label="State" htmlFor="inline-company-state">
                    <input
                      id="inline-company-state"
                      value={companyForm.state}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, state: e.target.value }))}
                      maxLength={120}
                      disabled={companyFormPending}
                      className={fieldInputClass}
                    />
                  </FieldRow>
                  <FieldRow label="Postcode" htmlFor="inline-company-postcode">
                    <input
                      id="inline-company-postcode"
                      value={companyForm.postcode}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, postcode: e.target.value }))}
                      maxLength={20}
                      disabled={companyFormPending}
                      className={fieldInputClass}
                    />
                  </FieldRow>
                  <FieldRow label="Tax ID" htmlFor="inline-company-tax-id">
                    <input
                      id="inline-company-tax-id"
                      value={companyForm.taxId}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, taxId: e.target.value }))}
                      maxLength={50}
                      disabled={companyFormPending}
                      className={fieldInputClass}
                    />
                  </FieldRow>

                  <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-brand-dark sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={companyForm.deliverySameAsMain}
                      onChange={(e) =>
                        setCompanyForm((f) => ({ ...f, deliverySameAsMain: e.target.checked }))
                      }
                      disabled={companyFormPending}
                      className="size-4 rounded border-slate-300 accent-brand"
                    />
                    Delivery address same as main address
                  </label>

                  {!companyForm.deliverySameAsMain ? (
                    <>
                      <FieldRow label="Delivery street" htmlFor="inline-company-delivery-street" required>
                        <input
                          id="inline-company-delivery-street"
                          value={companyForm.deliveryStreet}
                          onChange={(e) => setCompanyForm((f) => ({ ...f, deliveryStreet: e.target.value }))}
                          maxLength={120}
                          disabled={companyFormPending}
                          className={fieldInputClass}
                        />
                      </FieldRow>
                      <FieldRow label="Delivery city" htmlFor="inline-company-delivery-city" required>
                        <input
                          id="inline-company-delivery-city"
                          value={companyForm.deliveryCity}
                          onChange={(e) => setCompanyForm((f) => ({ ...f, deliveryCity: e.target.value }))}
                          maxLength={120}
                          disabled={companyFormPending}
                          className={fieldInputClass}
                        />
                      </FieldRow>
                      <FieldRow label="Delivery state" htmlFor="inline-company-delivery-state">
                        <input
                          id="inline-company-delivery-state"
                          value={companyForm.deliveryState}
                          onChange={(e) => setCompanyForm((f) => ({ ...f, deliveryState: e.target.value }))}
                          maxLength={120}
                          disabled={companyFormPending}
                          className={fieldInputClass}
                        />
                      </FieldRow>
                      <FieldRow label="Delivery postcode" htmlFor="inline-company-delivery-postcode" required>
                        <input
                          id="inline-company-delivery-postcode"
                          value={companyForm.deliveryPostcode}
                          onChange={(e) => setCompanyForm((f) => ({ ...f, deliveryPostcode: e.target.value }))}
                          maxLength={20}
                          disabled={companyFormPending}
                          className={fieldInputClass}
                        />
                      </FieldRow>
                      <FieldRow label="Delivery country" htmlFor="inline-company-delivery-country" required>
                        <CountrySelect
                          id="inline-company-delivery-country"
                          value={companyForm.deliveryCountry}
                          onChange={(value) => setCompanyForm((f) => ({ ...f, deliveryCountry: value }))}
                          disabled={companyFormPending}
                        />
                      </FieldRow>
                      <FieldRow label="Delivery contact" htmlFor="inline-company-delivery-contact">
                        <input
                          id="inline-company-delivery-contact"
                          value={companyForm.deliveryContactName}
                          onChange={(e) =>
                            setCompanyForm((f) => ({ ...f, deliveryContactName: e.target.value }))
                          }
                          maxLength={160}
                          disabled={companyFormPending}
                          className={fieldInputClass}
                        />
                      </FieldRow>
                      <FieldRow label="Delivery phone" htmlFor="inline-company-delivery-phone" className="sm:col-span-2">
                        <input
                          id="inline-company-delivery-phone"
                          value={companyForm.deliveryPhone}
                          onChange={(e) => setCompanyForm((f) => ({ ...f, deliveryPhone: e.target.value }))}
                          placeholder="+61 3 9338 3471"
                          maxLength={40}
                          disabled={companyFormPending}
                          className={fieldInputClass}
                        />
                      </FieldRow>
                    </>
                  ) : null}
                </div>
              ) : null}

              {companyFormError ? (
                <p role="alert" className="text-sm text-destructive">
                  {companyFormError}
                </p>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleCreateCompany}
                  disabled={companyFormPending || !companyForm.name.trim() || !companyForm.regionCode}
                  className="h-11 bg-brand text-white hover:bg-brand/90 sm:h-9"
                >
                  {companyFormPending ? "Creating…" : "Create company"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeCompanyForm}
                  disabled={companyFormPending}
                  className="h-11 sm:h-9"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {selectedCompany && !picking ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-brand-dark">Contact</span>
                <button
                  type="button"
                  onClick={() => (showContactForm ? closeContactForm() : setShowContactForm(true))}
                  disabled={pending}
                  className="focus-ring flex items-center gap-1 rounded-md text-xs font-medium text-brand hover:underline"
                >
                  <UserPlus className="size-3.5" aria-hidden="true" />
                  {showContactForm ? "Cancel" : "New contact"}
                </button>
              </div>

              {selectedCompany.contacts.length > 0 ? (
                <select
                  aria-label="Contact"
                  value={contactId}
                  onChange={(e) => handleContactChange(e.target.value)}
                  className={fieldInputClass}
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
              ) : !showContactForm ? (
                <p className="text-xs text-slate-500">No contacts on file yet.</p>
              ) : null}

              {showContactForm ? (
                <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FieldRow label="First name" htmlFor="inline-contact-first-name" required>
                      <input
                        id="inline-contact-first-name"
                        value={contactForm.firstName}
                        onChange={(e) => setContactForm((f) => ({ ...f, firstName: e.target.value }))}
                        maxLength={80}
                        disabled={contactFormPending}
                        className={fieldInputClass}
                      />
                    </FieldRow>
                    <FieldRow label="Last name" htmlFor="inline-contact-last-name">
                      <input
                        id="inline-contact-last-name"
                        value={contactForm.lastName}
                        onChange={(e) => setContactForm((f) => ({ ...f, lastName: e.target.value }))}
                        maxLength={80}
                        disabled={contactFormPending}
                        className={fieldInputClass}
                      />
                    </FieldRow>
                    <FieldRow label="Email" htmlFor="inline-contact-email">
                      <input
                        id="inline-contact-email"
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                        disabled={contactFormPending}
                        className={fieldInputClass}
                      />
                    </FieldRow>
                    <FieldRow label="Phone" htmlFor="inline-contact-phone">
                      <input
                        id="inline-contact-phone"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                        maxLength={40}
                        disabled={contactFormPending}
                        className={fieldInputClass}
                      />
                    </FieldRow>
                    <FieldRow label="Position" htmlFor="inline-contact-position" className="sm:col-span-2">
                      <input
                        id="inline-contact-position"
                        value={contactForm.position}
                        onChange={(e) => setContactForm((f) => ({ ...f, position: e.target.value }))}
                        maxLength={80}
                        disabled={contactFormPending}
                        className={fieldInputClass}
                      />
                    </FieldRow>
                  </div>

                  {contactFormError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {contactFormError}
                    </p>
                  ) : null}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={handleCreateContact}
                      disabled={contactFormPending || !contactForm.firstName.trim()}
                      className="h-11 bg-brand text-white hover:bg-brand/90 sm:h-9"
                    >
                      {contactFormPending ? "Creating…" : "Create contact"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={closeContactForm}
                      disabled={contactFormPending}
                      className="h-11 sm:h-9"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
