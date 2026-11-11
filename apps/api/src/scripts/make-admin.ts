/**
 * Gives an existing account admin rights: `pnpm --filter api make-admin someone@example.com`.
 * A script instead of an endpoint, so no API bug can ever turn a user into an admin.
 */
import { db } from "../lib/db.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: pnpm --filter api make-admin <email>");
  process.exit(1);
}

const { count } = await db.user.updateMany({ where: { email }, data: { isAdmin: true } });
console.log(count === 1 ? `${email} is now an admin.` : `No account found for ${email}.`);
await db.$disconnect();
process.exit(count === 1 ? 0 : 1);
