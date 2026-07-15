import { serve } from "@hono/node-server";
import { db, user } from "@distill/db";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { auth, trustedOrigins } from "./auth.js";
import { articlesRouter } from "./routes/articles.js";
import { credentialsRouter } from "./routes/credentials.js";
import { feedsRouter } from "./routes/feeds.js";
import { imagesRouter } from "./routes/images.js";
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

app.route("/feeds", feedsRouter);
app.route("/tags", tagsRouter);
app.route("/articles", articlesRouter);
app.route("/img", imagesRouter);
app.route("/credentials", credentialsRouter);
app.route("/settings", settingsRouter);
app.route("/tts", ttsRouter);

const port = Number(process.env.API_PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
