import { useQuery } from "@tanstack/react-query";

interface SetupStatus {
  needsSetup: boolean;
}

export const setupStatusQueryKey = ["setup-status"] as const;

async function fetchSetupStatus(): Promise<SetupStatus> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/setup/status`);
  if (!res.ok) {
    throw new Error("Failed to load setup status");
  }
  return res.json();
}

export function useSetupStatus() {
  return useQuery({ queryKey: setupStatusQueryKey, queryFn: fetchSetupStatus });
}

interface SocialProviders {
  github: boolean;
  google: boolean;
}

export const socialProvidersQueryKey = ["social-providers"] as const;

async function fetchSocialProviders(): Promise<SocialProviders> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/social-providers`);
  if (!res.ok) {
    throw new Error("Failed to load social providers");
  }
  return res.json();
}

// Only providers with credentials configured server-side are reported here
// — a button for one that isn't would just fail when clicked (auth.ts
// builds its socialProviders from the same env vars).
export function useSocialProviders() {
  return useQuery({ queryKey: socialProvidersQueryKey, queryFn: fetchSocialProviders });
}
