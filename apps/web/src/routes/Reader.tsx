import { useState } from "react";
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

  return (
    <div
      className="flex h-screen flex-col bg-[var(--surface-bg)] text-[var(--surface-fg)] md:flex-row"
      style={vars}
    >
      <FeedSidebar
        className={cn("md:flex", mobileView === "sidebar" ? "flex" : "hidden")}
        selection={selection}
        onSelect={(next) => {
          onSelectionChange(next);
          onSelectedArticleIdChange(null);
          onMobileViewChange("list");
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
        }}
        onBack={() => onMobileViewChange("sidebar")}
      />
      <ArticleReader
        className={cn("md:flex", mobileView === "reader" ? "flex" : "hidden")}
        articleId={selectedArticleId}
        onBack={() => onMobileViewChange("list")}
      />
    </div>
  );
}
