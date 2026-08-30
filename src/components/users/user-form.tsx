"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldRow, fieldInputClass } from "@/components/ui-kit";
import type { ActionResult } from "@/lib/actions/users";

export type RegionOption = { code: string; name: string };

const initialState: ActionResult = {};

/**
 * The "new user" form. On success `createUser` redirects to the new user's
 * editor, so this only ever needs to render an error state — same shape as
 * `CompanyForm`/`ProductForm` (src/components/clients/company-form.tsx,
 * src/components/catalog/product-form.tsx). Email/role/region occupy the
 * two-column grid; the password field spans full-width with its
 * magic-link-only note directly beneath it.
 */
export function UserForm({
  action,
  regions,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  regions: RegionOption[];
}) {
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => action(formData),
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FieldRow label="Email" htmlFor="user-email" required>
          <input
            id="user-email"
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="off"
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Name" htmlFor="user-name">
          <input id="user-name" name="name" maxLength={120} className={fieldInputClass} />
        </FieldRow>

        <FieldRow label="Role" htmlFor="user-role" required>
          <select id="user-role" name="role" defaultValue="MANAGER" required className={fieldInputClass}>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </select>
        </FieldRow>

        <FieldRow label="Region" htmlFor="user-region" hint="Leave unset if this user isn't tied to one region.">
          <select id="user-region" name="regionCode" defaultValue="" className={fieldInputClass}>
            <option value="">No region</option>
            {regions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </FieldRow>

        <FieldRow
          label="Initial password"
          htmlFor="user-password"
          className="lg:col-span-2"
          hint="Leave empty to let the user sign in via magic link only."
        >
          <input
            id="user-password"
            name="password"
            type="password"
            minLength={10}
            maxLength={200}
            autoComplete="new-password"
            className={fieldInputClass}
          />
        </FieldRow>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto sm:self-start"
      >
        {pending ? "Creating…" : "Create user"}
      </Button>
    </form>
  );
}
