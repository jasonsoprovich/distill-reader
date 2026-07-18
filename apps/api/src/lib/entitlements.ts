import { eq } from "drizzle-orm";
import { db, subscription } from "@distill/db";
import type { ReaderThemeName } from "@distill/shared";

// Global kill switch: while unset/false, every check below resolves to PRO_LIMITS
// regardless of subscription state, so the app behaves exactly as it did before this
// file existed. Flip to "true" only once real Stripe plans/pricing exist — see
// STRIPE_* vars in .env.example and the plugin wiring in ../auth.ts.
const PAYWALL_ENABLED = process.env.PAYWALL_ENABLED === "true";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export interface Entitlements {
  maxFeeds: number | null; // null = unlimited
  aiFeatures: boolean;
  byokCredentials: boolean;
  allowedThemes: readonly ReaderThemeName[] | null; // null = all themes allowed
}

const PRO_LIMITS: Entitlements = {
  maxFeeds: null,
  aiFeatures: true,
  byokCredentials: true,
  allowedThemes: null,
};

// Placeholder defaults per the user's rough plan (light/dark only, 5 feeds, no AI, no
// BYOK) — trivially adjustable here once real pricing/tiers are decided.
const FREE_LIMITS: Entitlements = {
  maxFeeds: 5,
  aiFeatures: false,
  byokCredentials: false,
  allowedThemes: ["light", "dark"],
};

async function hasActiveSubscription(userId: string): Promise<boolean> {
  const rows = await db.select({ status: subscription.status }).from(subscription).where(eq(subscription.referenceId, userId));
  return rows.some((row) => ACTIVE_STATUSES.has(row.status));
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  if (!PAYWALL_ENABLED) return PRO_LIMITS;
  return (await hasActiveSubscription(userId)) ? PRO_LIMITS : FREE_LIMITS;
}

// Each check returns a denial reason (for the route to turn into a 402 response) or
// null when allowed, matching this codebase's existing `return c.json({message}, code)`
// error style rather than throwing.
export interface EntitlementDenial {
  message: string;
}

export async function checkCanAddFeed(userId: string, currentFeedCount: number): Promise<EntitlementDenial | null> {
  const { maxFeeds } = await getEntitlements(userId);
  if (maxFeeds !== null && currentFeedCount >= maxFeeds) {
    return { message: `The free plan is limited to ${maxFeeds} feeds. Upgrade for unlimited feeds.` };
  }
  return null;
}

export async function checkAiAllowed(userId: string): Promise<EntitlementDenial | null> {
  const { aiFeatures } = await getEntitlements(userId);
  return aiFeatures ? null : { message: "AI summaries require a paid subscription." };
}

export async function checkByokAllowed(userId: string): Promise<EntitlementDenial | null> {
  const { byokCredentials } = await getEntitlements(userId);
  return byokCredentials ? null : { message: "Custom API keys require a paid subscription." };
}

export async function checkThemeAllowed(userId: string, themeName: ReaderThemeName): Promise<EntitlementDenial | null> {
  const { allowedThemes } = await getEntitlements(userId);
  if (allowedThemes && !allowedThemes.includes(themeName)) {
    return { message: `The "${themeName}" theme requires a paid subscription.` };
  }
  return null;
}
