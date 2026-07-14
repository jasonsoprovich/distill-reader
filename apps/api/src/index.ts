import { serve } from "@hono/node-server";
import { db, user } from "@distill/db";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { auth, trustedOrigins } from "./auth.js";

const app = new Hono();

app.use("*", secureHeaders());
app.use(
  "/auth/*",
  cors({
    origin: trustedOrigins,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);
app.use(
  "/setup/*",
  cors({
    origin: trustedOrigins,
    allowMethods: ["GET", "OPTIONS"],
    maxAge: 600,
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

async function hasAnyUser() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(user);
  return Number(count) > 0;
}

// Public so the SPA can decide whether to show the first-run setup page.
app.get("/setup/status", async (c) => {
  const needsSetup = !(await hasAnyUser());
  return c.json({ needsSetup });
});

// Self-hosted single-user app: sign-up creates the one account during
// first-run setup, then locks itself out. Without this, Better Auth's
// emailAndPassword config leaves /auth/sign-up/email open indefinitely.
app.post("/auth/sign-up/email", async (c) => {
  if (await hasAnyUser()) {
    return c.json({ message: "Sign-up is disabled — an account already exists." }, 403);
  }
  return auth.handler(c.req.raw);
});

app.on(["POST", "GET"], "/auth/*", (c) => auth.handler(c.req.raw));

const port = Number(process.env.API_PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
