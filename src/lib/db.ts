import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 dropped the schema-embedded `datasource.url`; the runtime client
// now requires an explicit driver adapter instead of reading DATABASE_URL on its own.
const adapter = new PrismaPg(process.env.DATABASE_URL as string);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
