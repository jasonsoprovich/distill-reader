import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

// PLAN §13 Phase 8 — surfaces the two states vite-plugin-pwa's service
// worker can report: newly installable-offline, or a new version waiting to
// take over. Neither auto-dismisses like the toast queue (lib/toast.ts) —
// the user should actively choose to reload, not have it happen underneath
// them mid-read.
export default function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground shadow-md">
      <span>{offlineReady ? "Distill is ready to work offline." : "A new version is available."}</span>
      {needRefresh && (
        <Button size="sm" onClick={() => updateServiceWorker(true)}>
          Reload
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={close}>
        Dismiss
      </Button>
    </div>
  );
}
