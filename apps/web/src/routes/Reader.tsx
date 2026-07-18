import { useEffect, useState } from "react";
import ArticleList from "@/components/ArticleList";
import ArticleReader from "@/components/ArticleReader";
import FeedSidebar from "@/components/FeedSidebar";
import { useReaderTheme } from "@/lib/reader-theme";
import type { Selection } from "@/lib/selection";
import { cn } from "@/lib/utils";

// Below the md breakpoint, only one pane is visible at a time — this tracks
// which, so phone/tablet gets a real single-pane navigable view (PLAN §13
// Phase 8) instead of three squeezed-together columns. Unused at md+, where
// all three panes show simultaneously regardless of this state.
export type MobileView = "sidebar" | "list" | "reader";

const SIDEBAR_COLLAPSED_KEY = "distill:sidebarCollapsed";

function loadCollapsed(key: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "true";
}

// Below md, the three panes are a single-pane back-stack (sidebar -> list ->
// reader) rather than real routes. At md+ all three show simultaneously, so
// there's no "back" to trap — history push/pop is skipped entirely there.
function isMobileLayout(): boolean {
  return typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches;
}

interface MobileHistoryState {
  distillMobileView?: MobileView;
}

interface ReaderProps {
  // Owned by App, not local state here — a round trip to /settings and
  // back unmounts/remounts this component, and state that lived here would
  // reset with it. See App.tsx for the full reasoning.
  selection: Selection;
  onSelectionChange: (next: Selection) => void;
  selectedArticleId: string | null;
  onSelectedArticleIdChange: (next: string | null) => void;
  mobileView: MobileView;
  onMobileViewChange: (next: MobileView) => void;
}

export default function Reader({
  selection,
  onSelectionChange,
  selectedArticleId,
  onSelectedArticleIdChange,
  mobileView,
  onMobileViewChange,
}: ReaderProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadCollapsed(SIDEBAR_COLLAPSED_KEY));
  const { vars } = useReaderTheme();

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  // Selecting a feed or an article pushes a history entry recording the
  // pane it opened, so the phone's hardware/gesture back button (which
  // fires popstate, below) steps back into the app one pane at a time
  // instead of leaving the site entirely — mirroring what the on-screen
  // back buttons already did.
  function pushMobileHistory(next: MobileView) {
    if (!isMobileLayout()) return;
    const state: MobileHistoryState = { distillMobileView: next };
    window.history.pushState(state, "");
  }

  // Reused by both the in-app back buttons and the browser/gesture back
  // (via popstate below) so the two stay in sync — going "back" always pops
  // one history entry rather than one directly setting state and the other
  // popping it, which would desync the stack.
  function goBack(fallback: MobileView) {
    if (isMobileLayout()) {
      window.history.back();
      return;
    }
    onMobileViewChange(fallback);
    if (fallback !== "reader") onSelectedArticleIdChange(null);
  }

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      if (!isMobileLayout()) return;
      const view = (event.state as MobileHistoryState | null)?.distillMobileView ?? "sidebar";
      onMobileViewChange(view);
      // Leaving the reader pane this way (back button, swipe, or hardware
      // back) should stop any audio in flight — it's the only handle on
      // playback, and once this pane is hidden the AudioBar controlling it
      // goes with it.
      if (view !== "reader") onSelectedArticleIdChange(null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [onMobileViewChange, onSelectedArticleIdChange]);

  return (
    <div
      className="flex h-dvh flex-col bg-[var(--surface-bg)] text-[var(--surface-fg)] md:flex-row"
      style={vars}
    >
      <FeedSidebar
        className={cn("md:flex", mobileView === "sidebar" ? "flex" : "hidden")}
        selection={selection}
        onSelect={(next) => {
          onSelectionChange(next);
          onSelectedArticleIdChange(null);
          onMobileViewChange("list");
          pushMobileHistory("list");
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
      />
      <ArticleList
        className={cn("md:flex", mobileView === "list" ? "flex" : "hidden")}
        selection={selection}
        selectedArticleId={selectedArticleId}
        onSelectArticle={(id) => {
          onSelectedArticleIdChange(id);
          onMobileViewChange("reader");
          pushMobileHistory("reader");
        }}
        onBack={() => goBack("sidebar")}
      />
      <ArticleReader
        className={cn("md:flex", mobileView === "reader" ? "flex" : "hidden")}
        articleId={selectedArticleId}
        onBack={() => goBack("list")}
      />
    </div>
  );
}
