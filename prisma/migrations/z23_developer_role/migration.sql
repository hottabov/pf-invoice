-- Adds DEVELOPER to the Role enum. Its rights are identical to ADMIN
-- everywhere in the app (see isAdminRole, src/lib/roles.ts) -- what makes it
-- distinct is that the new support form (z24_support_message) addresses its
-- message to whoever holds it.
--
-- Postgres can append a value to an enum type but can never drop one, so
-- this direction (add) is the only cheap one available; if DEVELOPER is ever
-- retired, the fix is to stop assigning it to any user, not to remove it
-- from the type.
ALTER TYPE "Role" ADD VALUE 'DEVELOPER';
