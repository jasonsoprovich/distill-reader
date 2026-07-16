import { db, user } from "@distill/db";
import { sql } from "drizzle-orm";

// Self-hosted single-user app: exactly one account ever exists. Shared
// between index.ts (blocks POST /auth/sign-up/email once a user exists) and
// auth.ts (blocks user creation via any other path — OAuth included — through
// a databaseHooks.user.create.before hook).
export async function hasAnyUser(): Promise<boolean> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(user);
  return Number(count) > 0;
}
