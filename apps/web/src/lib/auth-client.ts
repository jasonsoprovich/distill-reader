import { createAuthClient } from "better-auth/react";
import { stripeClient } from "@better-auth/stripe/client";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL,
  basePath: "/auth",
  fetchOptions: {
    credentials: "include",
  },
  // Only adds client-side methods (subscription.upgrade/list/cancel/billingPortal) —
  // harmless when the server-side plugin isn't registered (unconfigured Stripe env
  // vars, per auth.ts's buildPlugins()); those calls would just 404 in that case.
  plugins: [stripeClient({ subscription: true })],
});

export const { signIn, signOut, useSession } = authClient;
