"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

type ActionResult = { error?: string; success?: string };

const GENERIC_ERROR = "Invalid credentials";

// --- In-memory rate limiting ------------------------------------------------
//
// Keyed by normalized email. This is intentionally simple: a plain Map held
// in the module's memory, not backed by Redis or the database. It resets on
// every process restart/deploy and is not shared across instances. That's an
// accepted tradeoff for this single-instance internal app — the goal is to
// blunt casual brute-force/spam attempts, not to withstand a distributed
// attacker.

type AttemptWindow = { count: number; windowStart: number };

function isRateLimited(
  attempts: Map<string, AttemptWindow>,
  key: string,
  max: number,
  windowMs: number
): boolean {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.windowStart >= windowMs) return false;
  return entry.count >= max;
}

function recordAttempt(attempts: Map<string, AttemptWindow>, key: string, windowMs: number) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    attempts.set(key, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

// --- callbackUrl -------------------------------------------------------------

// Only allow same-origin relative paths for post-login redirects: must start
// with a single "/" and not "//" (a "//host/path" value is treated by
// browsers — and by some redirect() implementations — as protocol-relative,
// i.e. it navigates to an attacker-controlled external host). Anything else
// falls back to "/".
function safeCallbackUrl(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

// --- Password login ----------------------------------------------------------

const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_MAX = 5;
const loginAttempts = new Map<string, AttemptWindow>();

export async function loginWithPassword(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl"));

  if (!email || !password) {
    return { error: GENERIC_ERROR };
  }

  if (isRateLimited(loginAttempts, email, LOGIN_ATTEMPT_MAX, LOGIN_ATTEMPT_WINDOW_MS)) {
    // Same generic message as any other failure — don't reveal that the
    // account is being rate-limited.
    return { error: GENERIC_ERROR };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      // Never reveal whether the email exists, whether the password was
      // wrong, or whether the account is inactive — always the same
      // generic message.
      recordAttempt(loginAttempts, email, LOGIN_ATTEMPT_WINDOW_MS);
      return { error: GENERIC_ERROR };
    }
    // Next's redirect() throws a special error to perform the navigation;
    // rethrow anything that isn't an AuthError so that redirect works. This
    // is the success path, so clear this email's failed-attempt counter.
    loginAttempts.delete(email);
    throw error;
  }
}

// --- Magic link --------------------------------------------------------------

const MAGIC_LINK_SENT = "Check your email for a sign-in link.";
const MAGIC_LINK_WINDOW_MS = 15 * 60 * 1000;
const MAGIC_LINK_MAX = 3;
const magicLinkSends = new Map<string, AttemptWindow>();

export async function sendMagicLink(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    // Same message as "sent" — an empty submission isn't a signal either way.
    return { success: MAGIC_LINK_SENT };
  }

  if (isRateLimited(magicLinkSends, email, MAGIC_LINK_MAX, MAGIC_LINK_WINDOW_MS)) {
    // Still report generic success — rate-limiting must not leak whether
    // the email exists or how many times a link has already been requested.
    return { success: MAGIC_LINK_SENT };
  }
  recordAttempt(magicLinkSends, email, MAGIC_LINK_WINDOW_MS);

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
