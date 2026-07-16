import { useState } from "react";
import { GithubIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useSocialProviders } from "@/lib/setup";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

// Used on both Login (sign into the existing account) and Setup (create the
// app's one account) — auth.ts's databaseHooks guard is what decides which
// of those two actually happens for a given click, not anything here.
export default function SocialSignInButtons() {
  const { data: socialProviders } = useSocialProviders();
  const [error, setError] = useState<string | null>(null);

  async function signInWithSocial(provider: "github" | "google") {
    setError(null);
    await authClient.signIn.social({
      provider,
      callbackURL: "/",
      fetchOptions: {
        onError: (ctx) => setError(ctx.error.message ?? "Sign in failed."),
      },
    });
  }

  if (!socialProviders?.github && !socialProviders?.google) return null;

  return (
    <div className="mt-6 flex flex-col gap-2">
      {socialProviders.github && (
        <button
          type="button"
          onClick={() => signInWithSocial("github")}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          <GithubIcon className="size-4" />
          Continue with GitHub
        </button>
      )}
      {socialProviders.google && (
        <button
          type="button"
          onClick={() => signInWithSocial("google")}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          <GoogleIcon />
          Continue with Google
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3 pt-2 text-xs text-neutral-400">
        <span className="h-px flex-1 bg-neutral-200" />
        or
        <span className="h-px flex-1 bg-neutral-200" />
      </div>
    </div>
  );
}
