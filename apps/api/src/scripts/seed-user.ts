import { sql } from "drizzle-orm";
import { db, user } from "@distill/db";
import { auth } from "../auth.js";

async function main() {
  const email = process.env.INITIAL_USER_EMAIL;
  const password = process.env.INITIAL_USER_PASSWORD;
  const name = process.env.INITIAL_USER_NAME ?? "Admin";

  if (!email || !password) {
    console.log("INITIAL_USER_EMAIL / INITIAL_USER_PASSWORD not set — skipping user seed.");
    return;
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(user);
  if (Number(count) > 0) {
    console.log("A user already exists — skipping seed.");
    return;
  }

  await auth.api.signUpEmail({ body: { email, password, name } });
  console.log(`Seeded initial user ${email}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to seed initial user:", err);
    process.exit(1);
  });
