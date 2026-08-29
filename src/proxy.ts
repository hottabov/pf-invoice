import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the `middleware` export is
// now `proxy`). Proxy always runs on the Node.js runtime in Next 16 (the
// `runtime` config option was removed and throws if set), so it's safe to
// import `auth` here directly — including its Prisma-backed adapter,
// Credentials, and Nodemailer providers.
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and common static assets; everything else
    // (including all app routes and API routes not covered above) goes
    // through the auth check.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
