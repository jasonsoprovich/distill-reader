import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { auth, trustedOrigins } from "./auth.js";
import { hasAnyUser, isSignupAllowed } from "./lib/users.js";
import { authRateLimit, globalRateLimit } from "./middleware/rate-limit.js";
import { articlesRouter } from "./routes/articles.js";
import { credentialsRouter } from "./routes/credentials.js";
import { feedsRouter } from "./routes/feeds.js";
import { imagesRouter } from "./routes/images.js";
import { meRouter } from "./routes/me.js";
import { settingsRouter } from "./routes/settings.js";
import { tagsRouter } from "./routes/tags.js";
import { ttsRouter } from "./routes/tts.js";

const app = new Hono();

// The signed image proxy is meant to be embedded cross-origin (the web
// app's <img> tags) — the HMAC signature is what authorizes each request,
// so it's safe to relax CORP here specifically. Registered before the
// blanket "*" secureHeaders() below so it's the outer layer for this exact
// path and its header value is the one that survives (secureHeaders sets
// headers on the way back out, so the outermost matching middleware wins).
app.use("/img", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
// PLAN §10.5: X-Frame-Options DENY (tighter than the default SAMEORIGIN —
// this is a JSON API, no legitimate same-origin frame use) and a 2-year HSTS
// max-age with includeSubDomains, matching the SPA's nginx config. HSTS is a
// no-op over plain HTTP (browsers only honor it after an HTTPS response), so
// it's safe to emit unconditionally ahead of the reverse-proxy TLS termination
// self-hosted deployments are expected to run behind (§11).
app.use("*", secureHeaders({ xFrameOptions: "DENY", strictTransportSecurity: "max-age=63072000; includeSubDomains" }));
// Global abuse control (PLAN §10.6), ahead of auth/routing — see
// middleware/rate-limit.ts for why it's keyed by IP here.
app.use("*", globalRateLimit);
// Stricter limit specifically on auth endpoints (PLAN §10.4 — blunt brute
// force on login/reset), layered on top of the global limit above.
app.use("/auth/*", authRateLimit);
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
const jsonApiCors = cors({
  origin: trustedOrigins,
  // Range is required for cross-origin <audio> scrubbing on /tts/audio/:id
  // (GET /tts/*) — the browser's own Range header on seek isn't
  // CORS-safelisted, so it needs an explicit allow or the preflight fails.
  allowHeaders: ["Content-Type", "Range"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Range", "Accept-Ranges", "Content-Length"],
  maxAge: 600,
  credentials: true,
});
app.use("/feeds/*", jsonApiCors);
app.use("/tags/*", jsonApiCors);
app.use("/articles/*", jsonApiCors);
app.use("/credentials/*", jsonApiCors);
app.use("/settings/*", jsonApiCors);
app.use("/tts/*", jsonApiCors);
app.use("/me/*", jsonApiCors);

app.get("/health", (c) => c.json({ status: "ok" }));

// Public so the SPA can decide whether to show the first-run setup page.
app.get("/setup/status", async (c) => {
  const needsSetup = !(await hasAnyUser());
  return c.json({ needsSetup });
});

// Public so the login page only renders OAuth buttons for providers the
// operator has actually configured credentials for (auth.ts builds
// socialProviders from these same env vars) — a button for an unconfigured
// provider would just 404/error when clicked.
app.get("/auth/social-providers", (c) => {
  return c.json({
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
});

// Self-hosted app: sign-up creates the first account during first-run setup;
// after that, only allowlisted emails (ALLOWED_SIGNUP_EMAILS) get in. Without
// this, Better Auth's emailAndPassword config leaves /auth/sign-up/email open
// indefinitely. Reads a cloned request so the body stream is still intact
// for auth.handler to parse below.
app.post("/auth/sign-up/email", async (c) => {
  const body = (await c.req.raw.clone().json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  if (!email || !(await isSignupAllowed(email))) {
    return c.json({ message: "Sign-up is disabled for this email address." }, 403);
  }
  return auth.handler(c.req.raw);
});

app.on(["POST", "GET"], "/auth/*", (c) => auth.handler(c.req.raw));

app.route("/feeds", feedsRouter);
app.route("/tags", tagsRouter);
app.route("/articles", articlesRouter);
app.route("/img", imagesRouter);
app.route("/credentials", credentialsRouter);
app.route("/settings", settingsRouter);
app.route("/tts", ttsRouter);
app.route("/me", meRouter);

const port = Number(process.env.API_PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
