import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { authClient, useSession } from "../lib/auth-client";
import { useSetupStatus } from "../lib/setup";

export default function Login() {
  const { data: session, isPending: isSessionPending } = useSession();
  const { data: setupStatus, isPending: isStatusPending } = useSetupStatus();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect reactively once the session store picks up a freshly-created
  // session, instead of navigating immediately on signIn's onSuccess — that
  // races ahead of the store update and bounces straight back to /login.
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

    await authClient.signIn.email(
      { email, password },
      {
        onError: (ctx) => setError(ctx.error.message ?? "Sign in failed."),
      },
    );

    setIsSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-neutral-900">Sign in to Distill</h1>
        <p className="mt-1 text-sm text-neutral-500">Your self-hosted reader.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
              autoComplete="current-password"
              required
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
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
