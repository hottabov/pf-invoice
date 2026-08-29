import "dotenv/config";

async function main() {
  const [email, password, roleArg, regionCode = "AU"] = process.argv.slice(2);
  if (!email) {
    console.error("usage: tsx scripts/create-user.ts <email> [password] [ADMIN|MANAGER] [regionCode]");
    process.exit(1);
  }

  // Import db module only after validation
  const { db } = await import("../src/lib/db");
  const { hash } = await import("@node-rs/argon2");
  const { Role } = await import("@prisma/client");

  // Strict role validation: an explicitly-provided value must be ADMIN or
  // MANAGER -- no silent fallback to ADMIN for a typo'd/invalid role. Only
  // an omitted arg defaults to ADMIN.
  let role: (typeof Role)[keyof typeof Role];
  if (roleArg === undefined) {
    role = Role.ADMIN;
  } else if (roleArg === "ADMIN" || roleArg === "MANAGER") {
    role = Role[roleArg];
  } else {
    console.error(`error: invalid role "${roleArg}", expected ADMIN or MANAGER`);
    process.exit(1);
  }

  const region = await db.region.findUnique({ where: { code: regionCode } });
  if (!region) console.warn(`warning: region ${regionCode} not found, user created without region`);
  const passwordHash = password ? await hash(password) : undefined;
  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, role, regionId: region?.id, active: true },
    create: { email: email.toLowerCase(), passwordHash, role, regionId: region?.id },
  });
  console.log(`ok: ${user.email} role=${user.role} region=${region?.code ?? "none"}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
