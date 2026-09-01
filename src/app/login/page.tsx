import Image from "next/image";
import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const rawCallbackUrl = Array.isArray(params.callbackUrl)
    ? params.callbackUrl[0]
    : params.callbackUrl;

  // Defense in depth: the server action (loginWithPassword) is the actual
  // trust boundary and re-validates this value itself, since the hidden
  // input below is client-controlled and could be tampered with regardless
  // of what we render here. This just avoids echoing an unsafe value into
  // the form in the first place. Same-origin relative paths only.
  const callbackUrl =
    typeof rawCallbackUrl === "string" &&
    rawCallbackUrl.startsWith("/") &&
    !rawCallbackUrl.startsWith("//")
      ? rawCallbackUrl
      : "/";

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-brand-dark px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg sm:p-8">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src="/pathquote-logo.png"
            alt=""
            aria-hidden="true"
            width={512}
            height={512}
            priority
            className="size-14 rounded-xl object-cover shadow-sm"
          />
          <div>
            <h1 className="text-2xl font-semibold text-brand-dark">PathQuote</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
          </div>
        </div>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </div>
  );
}
