import { and, eq } from "drizzle-orm";
import { db, tag } from "@distill/db";
import { createTagSchema, patchTagSchema } from "@distill/shared";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const tagsRouter = new Hono<{ Variables: AuthVariables }>();
tagsRouter.use("*", requireAuth);

tagsRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db.select().from(tag).where(eq(tag.userId, userId)).orderBy(tag.name);
  return c.json(rows);
});

tagsRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const body = createTagSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const [row] = await db
    .insert(tag)
    .values({ ...body.data, userId })
    .returning();
  return c.json(row, 201);
});

tagsRouter.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = patchTagSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Invalid request", issues: body.error.issues }, 400);

  const [row] = await db
    .update(tag)
    .set(body.data)
    .where(and(eq(tag.id, id), eq(tag.userId, userId)))
    .returning();
  if (!row) return c.json({ message: "Not found" }, 404);
  return c.json(row);
});

tagsRouter.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const result = await db
    .delete(tag)
    .where(and(eq(tag.id, id), eq(tag.userId, userId)))
    .returning({ id: tag.id });
  if (!result.length) return c.json({ message: "Not found" }, 404);
  return c.body(null, 204);
});
