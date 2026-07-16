import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { account, auditLog, db, session, user, verification } from "@distill/db";

// PLAN §10.6 — audit log for auth events. Sign-in/sign-up are the two
// security-relevant ones for brute-force/unusual-activity monitoring; both
// expose `ctx.context.newSession` in Better Auth's `after` hook once they
// succeed (a failed attempt never reaches this point, so nothing to log).
async function logAuthEvent(action: "sign_in" | "sign_up", ctx: { context: { newSession?: unknown }; headers?: Headers }) {
  const newSession = ctx.context.newSession as { user: { id: string } } | undefined;
  if (!newSession) return;
  await db.insert(auditLog).values({
    userId: newSession.user.id,
    action,
    targetType: "user",
    targetId: newSession.user.id,
    ip: ctx.headers?.get("x-forwarded-for") ?? null,
    userAgent: ctx.headers?.get("user-agent") ?? null,
  });
}

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required");
}

export const trustedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  basePath: "/auth",
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") await logAuthEvent("sign_in", ctx);
      else if (ctx.path === "/sign-up/email") await logAuthEvent("sign_up", ctx);
    }),
  },
});
