import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { verify } from "@node-rs/argon2";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
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
        if (!user?.active || !user.passwordHash) return null;

        const ok = await verify(user.passwordHash, password);
        if (!ok) return null;

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
      // carry it in the token for subsequent requests (no DB hit needed).
      if (user?.email) {
        const dbUser = await db.user.findUnique({ where: { email: user.email } });
        if (dbUser) {
          token.uid = dbUser.id;
          token.role = dbUser.role;
          token.regionId = dbUser.regionId;
        }
      }
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
