import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "../lib/auth-client";
import { useSetupStatus } from "../lib/setup";

export default function ProtectedLayout() {
  const { data: session, isPending: isSessionPending, error: sessionError } = useSession();
  const { data: setupStatus, isPending: isStatusPending, isError: isStatusError } = useSetupStatus();

  if (isSessionPending || isStatusPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  // A 401 genuinely means "not logged in" — redirect to /login as usual.
  // Any other session error (network down, API unreachable, 500) looks
  // identical to that unless checked explicitly, and shouldn't silently
  // bounce the user to the login screen with no explanation.
  const sessionFailedForOtherReason = sessionError && sessionError.status !== 401;
  if (sessionFailedForOtherReason || isStatusError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-neutral-500">
        <p>Couldn't reach the server. Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (setupStatus?.needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
