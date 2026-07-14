import type { MiddlewareHandler } from "hono";
import { auth } from "../auth.js";

export interface AuthVariables {
  userId: string;
}

// Every route mounted behind this resolves the Better Auth session itself
// (rather than trusting a client-supplied user id) and scopes all queries
// to c.get("userId") server-side, per PLAN §9.
export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  c.set("userId", session.user.id);
  await next();
};
