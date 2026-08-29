"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

type ActionResult = { error?: string; success?: string };

const GENERIC_ERROR = "Invalid credentials";

export async function loginWithPassword(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: GENERIC_ERROR };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      // Never reveal whether the email exists, whether the password was
      // wrong, or whether the account is inactive — always the same
      // generic message.
      return { error: GENERIC_ERROR };
    }
    // Next's redirect() throws a special error to perform the navigation;
    // rethrow anything that isn't an AuthError so that redirect works.
    throw error;
  }
}

const MAGIC_LINK_SENT = "Check your email for a sign-in link.";

export async function sendMagicLink(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");

  if (!email) {
    // Same message as "sent" — an empty submission isn't a signal either way.
    return { success: MAGIC_LINK_SENT };
  }

  try {
    await signIn("nodemailer", { email, redirect: false });
  } catch (error) {
    // The `signIn` callback in src/auth.ts rejects unknown/inactive emails
    // with AccessDenied *before* a verification token is created or an
    // email is sent (see @auth/core's sendToken). Auth.js throws that
    // AccessDenied (an AuthError subclass) all the way out here even with
    // `redirect: false`, because Next Server Actions run through the "raw"
    // codepath. If we surfaced that as a distinct error, an attacker could
    // tell registered emails apart from unregistered ones by which message
    // came back. So: swallow every AuthError and report the same generic
    // success either way. Only truly unexpected (non-Auth) errors — a bug,
    // not a rejected sign-in — are rethrown.
    if (!(error instanceof AuthError)) {
      throw error;
    }
  }

  return { success: MAGIC_LINK_SENT };
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
