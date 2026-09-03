import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Inlines package.json's "version" at build time (npm sets
  // npm_package_version for any script run via `npm run …`, which is how
  // the Dockerfile's `run build` stage invokes this) into
  // process.env.APP_VERSION wherever it's referenced — see
  // src/lib/app-version.ts. Needed because the standalone runtime image
  // never ships package.json itself, so there's nothing to read at request
  // time otherwise. This is the "app version" attached to a support-form
  // submission (src/lib/actions/support.ts) so a bug report carries a build
  // reference without a round trip back to whoever filed it.
  env: {
    APP_VERSION: process.env.npm_package_version,
  },
};

export default nextConfig;
