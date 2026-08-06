import { fetchOpenRouterModels, OpenRouterCatalogError } from "@distill/providers";
import { openRouterModelsQuerySchema } from "@distill/shared";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const openRouterRouter = new Hono<{ Variables: AuthVariables }>();
openRouterRouter.use("*", requireAuth);

// Populates the model picker in Settings for both AI summaries and TTS.
// Auth-gated purely so this isn't an open proxy onto OpenRouter's own public
// endpoint — no stored credential is needed, the catalog is the same for
// every user, and fetchOpenRouterModels caches it in-process for an hour.
openRouterRouter.get("/models", async (c) => {
  const query = openRouterModelsQuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ message: "Invalid or missing kind" }, 400);

  try {
    const models = await fetchOpenRouterModels(query.data.kind);
    return c.json(models);
  } catch (err) {
    const message = err instanceof OpenRouterCatalogError ? err.message : "Failed to load OpenRouter models";
    return c.json({ message }, 502);
  }
});
