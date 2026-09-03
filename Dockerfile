FROM node:22-alpine AS deps
WORKDIR /app
# The `postinstall: prisma generate` script (added so a plain `npm ci` leaves a
# usable client — Prisma 7 dropped its own install hook) runs as part of
# `npm ci`, and it needs the schema and config to exist. Copying just those two
# files rather than the whole `prisma/` directory keeps this layer cached when
# migrations or seed data change, which is most of the time.
COPY package*.json prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` statically imports route/proxy modules (including src/auth.ts
# -> src/lib/db.ts) to collect page data. That requires DATABASE_URL to be
# set to *something* syntactically valid (the Prisma driver adapter is lazy
# and doesn't connect at construction time) and AUTH_SECRET to be non-empty.
# These build-time placeholders are never used at runtime — the `run` stage
# only ships the standalone server output, and real values come from the
# container's env_file (see docker-compose.yml).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
RUN npx prisma generate && npm run build

FROM build AS tools
ENV NODE_ENV=production
CMD ["node", "-e", "console.log('tools image: run prisma/seed/user commands via docker compose run tools ...')"]

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
# Production forms are read from disk at request time; Next's standalone
# trace cannot include dynamically selected template filenames automatically.
COPY --from=build /app/src/lib/production-forms/templates ./src/lib/production-forms/templates
EXPOSE 3000
CMD ["node", "server.js"]
