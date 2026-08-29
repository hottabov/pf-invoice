"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { loginWithPassword, sendMagicLink } from "@/lib/actions/auth";

type ActionResult = { error?: string; success?: string };

const initialState: ActionResult = {};

type LoginFormProps = {
  /** Same-origin relative path to send the user to after a successful password login. */
  callbackUrl?: string;
};

export function LoginForm({ callbackUrl = "/" }: LoginFormProps) {
  const [mode, setMode] = useState<"password" | "magic-link">("password");
  const [passwordState, passwordAction, passwordPending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => loginWithPassword(formData),
    initialState
  );
  const [magicLinkState, magicLinkAction, magicLinkPending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => sendMagicLink(formData),
    initialState
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={passwordAction} className="flex flex-col gap-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-brand-dark">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-brand-dark">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        {passwordState.error ? (
          <p role="alert" className="text-sm text-destructive">
            {passwordState.error}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={passwordPending}
          className="h-10 w-full bg-brand text-white hover:bg-brand/90"
        >
          {passwordPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {mode === "magic-link" ? (
        <form action={magicLinkAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="magic-email" className="text-sm font-medium text-brand-dark">
              Email
            </label>
            <input
              id="magic-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          {magicLinkState.error ? (
            <p role="alert" className="text-sm text-destructive">
              {magicLinkState.error}
            </p>
          ) : null}
          {magicLinkState.success ? (
            <p role="status" className="text-sm text-brand-dark">
              {magicLinkState.success}
            </p>
          ) : (
            <Button
              type="submit"
              variant="outline"
              disabled={magicLinkPending}
              className="h-10 w-full border-brand-accent text-brand-accent hover:bg-brand-accent/10"
            >
              {magicLinkPending ? "Sending…" : "Send magic link"}
            </Button>
          )}
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setMode("magic-link")}
          className="h-10 w-full border-brand-accent text-brand-accent hover:bg-brand-accent/10"
        >
          Sign in with a magic link
        </Button>
      )}
    </div>
  );
}
