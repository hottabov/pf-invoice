import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { verify } from "@node-rs/argon2";
import { db } from "@/lib/db";

// A pre-computed, valid argon2id hash of a random, unused password. When no
// user is found (or the user has no passwordHash), we still run `verify`
// against this constant so the authorize() call takes roughly the same time
// whether or not the email exists — otherwise an attacker could enumerate
// registered emails by measuring response latency (DB lookup + hash miss vs.
// DB lookup + a full argon2 verify). This value is not a secret and is never
// used to authenticate anything.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$gAonQQ7IRqomDRUI9GVvrQ$Uq/TgecqsuEP1TO9SpOsmCEytUT7/hAECjX2DEqflH4";

// How often (ms) an existing JWT is re-checked against the database in the
// `jwt` callback below. Bounds how long a deactivated/deleted user's
// already-issued session stays valid.
const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    updateAge: 60 * 60, // 1 hour
  },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        const hashToVerify =
          user?.active && user.passwordHash ? user.passwordHash : DUMMY_PASSWORD_HASH;

        // Always run the argon2 verify, even for a nonexistent/inactive
        // user or one without a passwordHash, against the dummy hash above —
        // this keeps timing consistent regardless of which branch we took.
        let ok = false;
        try {
          ok = await verify(hashToVerify, password);
        } catch {
          // Malformed hash, decoding error, etc. — never let a throw here
          // leak information or crash the request; just fail closed.
          return null;
        }

        if (!user?.active || !user.passwordHash || !ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Nodemailer({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      },
      from: process.env.EMAIL_FROM,
      maxAge: 900, // magic link valid for 15 minutes
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only pre-created, active users may authenticate. The Credentials
      // provider's `authorize` above already enforces this, so this check
      // is only load-bearing for the magic-link (nodemailer) flow — it
      // must never create accounts on the fly. Auth.js runs this callback
      // *before* issuing a verification token or sending the email (see
      // @auth/core's sendToken), so an unknown/inactive email never gets a
      // link sent at all.
      if (!user.email) return false;
      const existing = await db.user.findUnique({ where: { email: user.email } });
      return !!existing?.active;
    },
    async jwt({ token, user }) {
      // `user` is only populated on the initial sign-in. Load the
      // authoritative role/region from the database at that point and
      // carry it in the token for subsequent requests.
      if (user?.email) {
        const dbUser = await db.user.findUnique({ where: { email: user.email } });
        if (!dbUser || !dbUser.active) return null;
        token.uid = dbUser.id;
        token.role = dbUser.role;
        token.regionId = dbUser.regionId;
        token.revalidatedAt = Date.now();
        return token;
      }

      // Subsequent invocation for an already-issued token: without this, a
      // user deactivated (or deleted) after signing in would keep a fully
      // valid session for up to `maxAge` (7 days), since the JWT is
      // self-contained and normally never touches the database again. Re-hit
      // the DB at most once per REVALIDATE_INTERVAL_MS to catch that case
      // and to keep role/regionId in sync with the source of truth, while
      // keeping the common case (a request within the interval) DB-free.
      const revalidatedAt = token.revalidatedAt ?? 0;
      if (Date.now() - revalidatedAt < REVALIDATE_INTERVAL_MS) {
        return token;
      }

      if (!token.uid) return null;
      const dbUser = await db.user.findUnique({ where: { id: token.uid } });
      if (!dbUser || !dbUser.active) return null;

      token.role = dbUser.role;
      token.regionId = dbUser.regionId;
      token.revalidatedAt = Date.now();
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid;
        session.user.role = token.role;
        session.user.regionId = token.regionId;
      }
      return session;
    },
  },
});
