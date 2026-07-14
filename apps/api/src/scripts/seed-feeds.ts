import { discoverFeed } from "@distill/extract";
import { db, feed, user } from "@distill/db";
import { PRESEED_SOURCES } from "@distill/shared";
import { eq } from "drizzle-orm";

// Dev convenience (PLAN §5.5): discovers and adds the preseed sources for
// the single bootstrapped user. Run manually — `pnpm --filter @distill/api
// run seed:feeds` — after sign-up/setup, not wired into docker compose,
// since it makes real outbound requests to the preseed sites.
async function main() {
  const [owner] = await db.select().from(user).limit(1);
  if (!owner) {
    console.log("No user exists yet — sign up (or run the seed-user script) first.");
    return;
  }

  const existing = await db.select({ sourceUrl: feed.sourceUrl }).from(feed).where(eq(feed.userId, owner.id));
  const existingUrls = new Set(existing.map((f) => f.sourceUrl));

  for (const source of PRESEED_SOURCES) {
    if (existingUrls.has(source.url)) {
      console.log(`Already have a feed for ${source.name} — skipping.`);
      continue;
    }

    const discovered = await discoverFeed(source.url);
    if (!discovered) {
      console.error(`Could not discover a feed for ${source.name} (${source.url}) — skipping.`);
      continue;
    }

    await db.insert(feed).values({
      userId: owner.id,
      sourceUrl: discovered.sourceUrl,
      feedUrl: discovered.feedUrl,
      kind: discovered.kind,
      title: discovered.title,
      siteUrl: discovered.siteUrl,
      faviconUrl: discovered.faviconUrl,
    });
    console.log(`Added feed: ${discovered.title} (${discovered.kind})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to seed preset feeds:", err);
    process.exit(1);
  });
