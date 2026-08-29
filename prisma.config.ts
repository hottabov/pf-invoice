// Prisma 7 config: the Prisma schema no longer accepts `datasource { url = ... }`.
// The connection URL for the Prisma CLI (migrate/db/studio) lives here instead.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
