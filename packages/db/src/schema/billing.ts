import { pgTable, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

// Managed by the Better Auth Stripe plugin (@better-auth/stripe) — field names/shapes
// match its expected schema so betterAuth({ plugins: [stripe({...})] }) can adopt this
// table as-is. Do not hand-edit without checking the plugin's schema docs.
//
// referenceId is deliberately NOT unique: it's the user id this subscription belongs
// to, and a user must be able to resubscribe after a cancellation (a new row, not a
// reused one), so multiple rows per user are expected over time.
export const subscription = pgTable(
  "subscription",
  {
    id: text("id").primaryKey(),
    plan: text("plan").notNull(),
    referenceId: text("reference_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: text("status").default("incomplete").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    cancelAt: timestamp("cancel_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    seats: integer("seats"),
    trialStart: timestamp("trial_start", { withTimezone: true }),
    trialEnd: timestamp("trial_end", { withTimezone: true }),
    billingInterval: text("billing_interval"),
    stripeScheduleId: text("stripe_schedule_id"),
  },
  (table) => [index("subscription_reference_id_idx").on(table.referenceId)],
);
