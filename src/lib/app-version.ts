// Best-effort build reference for a support-message report (see
// src/lib/actions/support.ts) — "a bug report without a build reference
// wastes a round trip." `APP_VERSION` is inlined at build time from
// package.json's "version" field by next.config.ts's `env` option; there is
// nothing cheaper available at request time, since the production image's
// standalone output never ships package.json for a runtime read (see that
// config's own comment). Falls back to "unknown" so a missing build
// reference never blocks a report from being filed, just makes it less
// useful.
export function getAppVersion(): string {
  return process.env.APP_VERSION?.trim() || "unknown";
}
