import { db, user } from "@distill/db";
import { sql } from "drizzle-orm";

// Self-hosted app: the first account (created via /setup, or via any
// sign-up flow before one exists) always gets in for free. Shared between
// index.ts (blocks POST /auth/sign-up/email) and auth.ts (blocks user
// creation via any other path — OAuth included — through a
// databaseHooks.user.create.before hook).
export async function hasAnyUser(): Promise<boolean> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(user);
  return Number(count) > 0;
}

function allowlistedSignupEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_SIGNUP_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

// After the first account exists, further sign-ups (any path — email/password
// or OAuth) are limited to addresses the operator has explicitly allowlisted
// via ALLOWED_SIGNUP_EMAILS, so a handful of invited testers can register
// their own accounts without opening registration to the public. Leaving the
// env var unset keeps the original single-user behavior (no further sign-ups).
export async function isSignupAllowed(email: string): Promise<boolean> {
  if (!(await hasAnyUser())) return true;
  return allowlistedSignupEmails().has(email.trim().toLowerCase());
}
