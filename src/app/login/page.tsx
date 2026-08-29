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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-semibold text-brand">PathQuote</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </div>
  );
}
