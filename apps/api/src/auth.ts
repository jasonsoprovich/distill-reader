import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { account, auditLog, db, session, user, verification } from "@distill/db";
import { isSignupAllowed } from "./lib/users.js";

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

// OAuth can create the app's one account (Setup.tsx offers these same
// buttons for exactly that) as well as sign into it afterward — the
// databaseHooks guard below is what keeps this to a single user, by
// dynamically allowing the first account from whichever flow creates it and
// rejecting every attempt after, so implicit sign-up doesn't need to be
// disabled per-provider here. Each provider is only added if both its env
// vars are set, so an unconfigured provider doesn't register a broken
// endpoint — GET /auth/social-providers (index.ts) reports this same set to
// the SPA so it only renders buttons that will actually work.
function buildSocialProviders() {
  const providers: NonNullable<Parameters<typeof betterAuth>[0]["socialProviders"]> = {};
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    };
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  return providers;
}

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
  socialProviders: buildSocialProviders(),
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  // Belt-and-suspenders with index.ts's POST /auth/sign-up/email guard:
  // this is the one choke point every user row passes through regardless
  // of which flow created it (email/password OR any OAuth provider), so
  // it's what actually guarantees the allowlist invariant rather than
  // relying on every current and future sign-up path remembering to check
  // it individually.
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          if (!(await isSignupAllowed(newUser.email))) {
            throw new APIError("BAD_REQUEST", { message: "Sign-up is disabled for this email address." });
          }
        },
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") await logAuthEvent("sign_in", ctx);
      else if (ctx.path === "/sign-up/email") await logAuthEvent("sign_up", ctx);
      else if (ctx.path.startsWith("/callback/")) await logAuthEvent("sign_in", ctx);
    }),
  },
});
