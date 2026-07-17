import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import SocialSignInButtons from "@/components/SocialSignInButtons";
import { authClient, useSession } from "../lib/auth-client";
import { useSetupStatus } from "../lib/setup";

// Reachable after the first (admin) account already exists — /setup is only
// for that first account and locks itself out afterward. The backend still
// has the final say (ALLOWED_SIGNUP_EMAILS, checked in auth.ts/index.ts), so
// this form existing doesn't by itself open registration to the public.
export default function Signup() {
  const { data: session, isPending: isSessionPending } = useSession();
  const { data: setupStatus, isPending: isStatusPending } = useSetupStatus();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isSessionPending && session) {
    return <Navigate to="/" replace />;
  }

  if (!isStatusPending && setupStatus?.needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    await authClient.signUp.email(
      { name, email, password },
      {
        onError: (ctx) => setError(ctx.error.message ?? "Could not create the account."),
      },
    );

    setIsSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-neutral-900">Create an account</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Sign-up is invite-only — your email needs to be on the allowlist for this instance.
        </p>

        <SocialSignInButtons />

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-neutral-700">
              Name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
