import { displayCountry } from "@/lib/countries";
import type { DocumentForForms } from "@/lib/queries/documents";
import { resolveForm } from "./resolve";
import type { FormContext, FormItem } from "./types";

type AddressLike = {
  street: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
};

/**
 * Three lines, matching the three underlined address rows every form prints.
 * Absent parts are skipped rather than left as gaps, so a company with no
 * state does not print a stray double space.
 */
export function companyAddressLines(address: AddressLike): string[] {
  const locality = [address.city, address.state, address.postcode].filter(Boolean).join(" ");
  const country = address.country ? displayCountry(address.country) : null;
  return [address.street, locality || null, country].filter((line): line is string => Boolean(line));
}

/**
 * Flattens the document the builder query already returns into one context
 * per item that prints a form. Items with no form -- software, services --
 * do not get a context; their codes are exposed on every context as
 * `softwareCodes` so a form can ask whether PathWorks Integrated was sold.
 */
export function buildFormContexts(document: DocumentForForms): FormContext[] {
  const snapshot = document.entitySnapshot as { entityName?: string } | null;
  const distributorName = snapshot?.entityName ?? document.region.entityName;

  const company = document.company;
  const addressLines = company ? companyAddressLines(company) : [];

  const deliveryAddressLines =
    company && !company.deliverySameAsMain
      ? companyAddressLines({
          street: company.deliveryStreet,
          city: company.deliveryCity,
          state: company.deliveryState,
          postcode: company.deliveryPostcode,
          country: company.deliveryCountry,
        })
      : addressLines;

  const softwareCodes = document.items
    .filter((item) => resolveForm(item.code) === null)
    .map((item) => item.code);

  return document.items
    .filter((item) => resolveForm(item.code) !== null)
    .map((item) => {
      const options = item.lines.filter((line) => line.kind === "OPTION");

      const formItem: FormItem = {
        id: item.id,
        code: item.code,
        name: item.name,
        spec: (item.productionSpec ?? {}) as Record<string, unknown>,
        optionCodes: options.map((line) => line.code).filter((c): c is string => Boolean(c)),
        optionAttributes: Object.fromEntries(
          options
            .filter((line) => line.code && line.attributes)
            .map((line) => [line.code as string, line.attributes as Record<string, unknown>]),
        ),
        optionQtys: options
          .filter((line): line is typeof line & { code: string } => Boolean(line.code))
          .map((line) => ({ code: line.code, qty: line.qty })),
      };

      return {
        distributorName,
        authorName: document.author.name ?? "",
        company: {
          name: company?.name ?? "",
          addressLines,
          industry: company?.industry?.name ?? null,
        },
        contact: {
          fullName: [document.contact?.firstName, document.contact?.lastName].filter(Boolean).join(" "),
          position: document.contact?.position ?? null,
          phone: document.contact?.phone ?? null,
          email: document.contact?.email ?? null,
        },
        deliveryAddressLines,
        softwareCodes,
        item: formItem,
      };
    });
}
