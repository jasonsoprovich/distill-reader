import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "../lib/auth-client";
import { useSetupStatus } from "../lib/setup";

export default function ProtectedLayout() {
  const { data: session, isPending: isSessionPending } = useSession();
  const { data: setupStatus, isPending: isStatusPending } = useSetupStatus();

  if (isSessionPending || isStatusPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Loading…
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
