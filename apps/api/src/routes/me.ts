import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { getEntitlements } from "../lib/entitlements.js";

export const meRouter = new Hono<{ Variables: AuthVariables }>();
meRouter.use("*", requireAuth);

// Lets the SPA know which limits currently apply so it can grey out gated
// controls later — while PAYWALL_ENABLED is off this always returns the
// unlimited/pro shape, so no UI changes are needed yet.
meRouter.get("/entitlements", async (c) => {
  const userId = c.get("userId");
  return c.json(await getEntitlements(userId));
});
