import { eq } from "drizzle-orm";
import { db, relayAgentToken } from "@distill/db";
import { hashToken } from "@distill/providers";
import type { MiddlewareHandler } from "hono";

export interface RelayAgentVariables {
  relayUserId: string;
  relayTokenId: string;
}

// Auth for the relay agent's WebSocket connect only — a bearer pairing
// token (relay_agent_token), not the Better Auth session cookie requireAuth
// checks. The agent is a headless Node process with no browser session to
// carry. Runs ahead of the WS upgrade so an invalid token never gets as far
// as a 101 response.
export const requireRelayToken: MiddlewareHandler<{ Variables: RelayAgentVariables }> = async (c, next) => {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return c.json({ message: "Missing relay pairing token" }, 401);

  const [row] = await db
    .select({ id: relayAgentToken.id, userId: relayAgentToken.userId })
    .from(relayAgentToken)
    .where(eq(relayAgentToken.tokenHash, hashToken(token)));
  if (!row) return c.json({ message: "Invalid relay pairing token" }, 401);

  await db.update(relayAgentToken).set({ lastSeenAt: new Date() }).where(eq(relayAgentToken.id, row.id));

  c.set("relayUserId", row.userId);
  c.set("relayTokenId", row.id);
  await next();
};
