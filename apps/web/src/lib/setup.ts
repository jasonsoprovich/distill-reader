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
