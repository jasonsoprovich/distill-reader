import { and, desc, eq } from "drizzle-orm";
import { apiCredential, db } from "@distill/db";
import { encryptSecret } from "@distill/providers";
import { createCredentialSchema } from "@distill/shared";
import type { CredentialDTO } from "@distill/shared";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const credentialsRouter = new Hono<{ Variables: AuthVariables }>();
credentialsRouter.use("*", requireAuth);

// Secrets are write-only (PLAN §10.3) — no endpoint ever returns
// secret_encrypted or a decrypted value, only whether one is on file.
function toDTO(row: typeof apiCredential.$inferSelect): CredentialDTO {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    baseUrl: row.baseUrl,
    hasSecret: row.secretEncrypted != null,
    createdAt: row.createdAt.toISOString(),
  };
}

credentialsRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(apiCredential)
    .where(eq(apiCredential.userId, userId))
    .orderBy(desc(apiCredential.createdAt));
  return c.json(rows.map(toDTO));
});

credentialsRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const body = createCredentialSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const { provider, label, secret, baseUrl } = body.data;
  const [row] = await db
    .insert(apiCredential)
    .values({
      userId,
      provider,
      label,
      secretEncrypted: secret ? encryptSecret(secret) : null,
      baseUrl: baseUrl ?? null,
    })
    .returning();

  return c.json(toDTO(row), 201);
});

credentialsRouter.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const result = await db
    .delete(apiCredential)
    .where(and(eq(apiCredential.id, id), eq(apiCredential.userId, userId)))
    .returning({ id: apiCredential.id });
  if (!result.length) return c.json({ message: "Not found" }, 404);
  return c.body(null, 204);
});
