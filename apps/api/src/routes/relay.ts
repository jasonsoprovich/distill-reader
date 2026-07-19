import { and, desc, eq } from "drizzle-orm";
import { auditLog, db, relayAgentToken } from "@distill/db";
import { generateRelayToken, hashToken } from "@distill/providers";
import { createRelayTokenSchema, type RelayAgentTokenDTO, type RelayStatusDTO, type RelayTokenCreatedDTO } from "@distill/shared";
import { Hono } from "hono";
import { agentRegistry } from "../lib/agent-registry.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const relayRouter = new Hono<{ Variables: AuthVariables }>();
relayRouter.use("*", requireAuth);

// Pairing tokens are write-once (the raw value only ever appears in the
// POST /tokens response, RelayTokenCreatedDTO) — every other read gets this
// hash-free shape, same pattern as CredentialDTO.hasSecret.
function toDTO(row: typeof relayAgentToken.$inferSelect): RelayAgentTokenDTO {
  return {
    id: row.id,
    label: row.label,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

relayRouter.get("/tokens", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(relayAgentToken)
    .where(eq(relayAgentToken.userId, userId))
    .orderBy(desc(relayAgentToken.createdAt));
  return c.json(rows.map(toDTO));
});

relayRouter.post("/tokens", async (c) => {
  const userId = c.get("userId");
  const body = createRelayTokenSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const token = generateRelayToken();
  const [row] = await db
    .insert(relayAgentToken)
    .values({ userId, label: body.data.label, tokenHash: hashToken(token) })
    .returning();

  await db.insert(auditLog).values({
    userId,
    action: "relay_token_create",
    targetType: "relay_agent_token",
    targetId: row.id,
    metadata: { label: row.label },
  });

  return c.json({ ...toDTO(row), token } satisfies RelayTokenCreatedDTO, 201);
});

relayRouter.delete("/tokens/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const result = await db
    .delete(relayAgentToken)
    .where(and(eq(relayAgentToken.id, id), eq(relayAgentToken.userId, userId)))
    .returning({ id: relayAgentToken.id, label: relayAgentToken.label });
  if (!result.length) return c.json({ message: "Not found" }, 404);

  await db.insert(auditLog).values({
    userId,
    action: "relay_token_delete",
    targetType: "relay_agent_token",
    targetId: result[0].id,
    metadata: { label: result[0].label },
  });

  return c.body(null, 204);
});

// Live connection state (is an agent's WebSocket currently open) alongside
// the last time any of this user's tokens successfully authenticated —
// distinct signals: a token can be valid but its agent offline right now.
relayRouter.get("/status", async (c) => {
  const userId = c.get("userId");
  const [row] = await db
    .select({ lastSeenAt: relayAgentToken.lastSeenAt })
    .from(relayAgentToken)
    .where(eq(relayAgentToken.userId, userId))
    .orderBy(desc(relayAgentToken.lastSeenAt))
    .limit(1);

  return c.json({
    connected: agentRegistry.isConnected(userId),
    lastSeenAt: row?.lastSeenAt?.toISOString() ?? null,
  } satisfies RelayStatusDTO);
});
