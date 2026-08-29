import "dotenv/config";

async function main() {
  const [email, password, roleArg = "ADMIN", regionCode = "AU"] = process.argv.slice(2);
  if (!email) {
    console.error("usage: tsx scripts/create-user.ts <email> [password] [ADMIN|MANAGER] [regionCode]");
    process.exit(1);
  }

  // Import db module only after validation
  const { db } = await import("../src/lib/db");
  const { hash } = await import("@node-rs/argon2");
  const { Role } = await import("@prisma/client");

  const role = roleArg === "MANAGER" ? Role.MANAGER : Role.ADMIN;
  const region = await db.region.findUnique({ where: { code: regionCode } });
  if (!region) console.warn(`warning: region ${regionCode} not found, user created without region`);
  const passwordHash = password ? await hash(password) : undefined;
  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, role, regionId: region?.id, active: true },
    create: { email: email.toLowerCase(), passwordHash, role, regionId: region?.id },
  });
  console.log(`ok: ${user.email} role=${user.role} region=${regionCode}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
