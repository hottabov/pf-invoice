"use client";

import { useState, useTransition } from "react";
import { Star, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/catalog/delete-button";
import { ContactForm } from "@/components/clients/contact-form";
import { cn } from "@/lib/utils";
import type { ActionResult, createContact, updateContact, deleteContact } from "@/lib/actions/clients";
import type { ContactDetail } from "@/lib/queries/clients";

type Actions = {
  createContact: typeof createContact;
  updateContact: typeof updateContact;
  deleteContact: typeof deleteContact;
};

/**
 * The contacts panel on a company's editor: a list of existing contacts
 * (each with an inline edit toggle, a one-click "make primary" star, and a
 * delete button) plus an always-available "add contact" form. All state
 * here is purely UI (which row is being edited, whether the add form is
 * open) — the actual contact data comes from the server component parent
 * and refreshes automatically after any action revalidates `/clients/[id]`.
 */
export function ContactsSection({
  companyId,
  contacts,
  actions,
}: {
  companyId: string;
  contacts: ContactDetail[];
  actions: Actions;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {contacts.length === 0 && !addOpen ? (
        <p className="text-sm text-muted-foreground">No contacts yet.</p>
      ) : null}

      {contacts.map((contact) =>
        editingId === contact.id ? (
          <div key={contact.id} className="rounded-lg border border-border bg-muted/40 p-3">
            <ContactForm
              idPrefix={`contact-${contact.id}`}
              action={actions.updateContact.bind(null, contact.id)}
              defaultValues={{
                firstName: contact.firstName,
                lastName: contact.lastName ?? "",
                email: contact.email ?? "",
                phone: contact.phone ?? "",
                position: contact.position ?? "",
                isPrimary: contact.isPrimary,
              }}
              submitLabel="Save contact"
              onDone={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
            />
          </div>
        ) : (
          <ContactRow
            key={contact.id}
            contact={contact}
            onEdit={() => setEditingId(contact.id)}
            makePrimary={actions.updateContact}
            onDelete={actions.deleteContact}
          />
        )
      )}

      {addOpen ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <ContactForm
            idPrefix="contact-new"
            action={actions.createContact.bind(null, companyId)}
            defaultValues={{
              firstName: "",
              lastName: "",
              email: "",
              phone: "",
              position: "",
              isPrimary: contacts.length === 0,
            }}
            submitLabel="Add contact"
            onDone={() => setAddOpen(false)}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setAddOpen(true)} className="w-fit">
          <Plus className="size-4" data-icon="inline-start" />
          Add contact
        </Button>
      )}
    </div>
  );
}

function ContactRow({
  contact,
  onEdit,
  makePrimary,
  onDelete,
}: {
  contact: ContactDetail;
  onEdit: () => void;
  makePrimary: (contactId: string, formData: FormData) => Promise<ActionResult>;
  onDelete: (contactId: string) => Promise<ActionResult>;
}) {
  const [pending, startTransition] = useTransition();

  function handleMakePrimary() {
    if (contact.isPrimary || pending) return;
    const formData = new FormData();
    formData.set("firstName", contact.firstName);
    formData.set("lastName", contact.lastName ?? "");
    formData.set("email", contact.email ?? "");
    formData.set("phone", contact.phone ?? "");
    formData.set("position", contact.position ?? "");
    formData.set("isPrimary", "on");
    startTransition(async () => {
      await makePrimary(contact.id, formData);
    });
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white p-3">
      <div className="flex flex-1 items-start gap-2">
        <button
          type="button"
          onClick={handleMakePrimary}
          disabled={pending}
          aria-label={contact.isPrimary ? "Primary contact" : "Make primary contact"}
          className="mt-0.5 shrink-0 disabled:cursor-not-allowed"
        >
          <Star
            className={cn(
              "size-4",
              contact.isPrimary ? "fill-brand text-brand" : "text-muted-foreground"
            )}
          />
        </button>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-brand-dark">
            {fullName}
            {contact.position && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {contact.position}
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {[contact.email, contact.phone].filter(Boolean).join(" · ") || "No email or phone"}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit contact">
          <Pencil className="size-4" />
        </Button>
        <DeleteButton
          action={onDelete.bind(null, contact.id)}
          confirmMessage={`Delete contact ${fullName}? This can't be undone.`}
        />
      </div>
    </div>
  );
}
