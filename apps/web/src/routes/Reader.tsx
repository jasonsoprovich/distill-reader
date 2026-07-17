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
type MobileView = "sidebar" | "list" | "reader";

const SIDEBAR_COLLAPSED_KEY = "distill:sidebarCollapsed";
const LIST_COLLAPSED_KEY = "distill:listCollapsed";

function loadCollapsed(key: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "true";
}

export default function Reader() {
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("sidebar");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadCollapsed(SIDEBAR_COLLAPSED_KEY));
  const [listCollapsed, setListCollapsed] = useState(() => loadCollapsed(LIST_COLLAPSED_KEY));
  const { vars } = useReaderTheme();

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  function toggleListCollapsed() {
    setListCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(LIST_COLLAPSED_KEY, String(next));
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
          setSelection(next);
          setSelectedArticleId(null);
          setMobileView("list");
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
      />
      <ArticleList
        className={cn("md:flex", mobileView === "list" ? "flex" : "hidden")}
        selection={selection}
        selectedArticleId={selectedArticleId}
        onSelectArticle={(id) => {
          setSelectedArticleId(id);
          setMobileView("reader");
        }}
        onBack={() => setMobileView("sidebar")}
        collapsed={listCollapsed}
        onToggleCollapse={toggleListCollapsed}
      />
      <ArticleReader
        className={cn("md:flex", mobileView === "reader" ? "flex" : "hidden")}
        articleId={selectedArticleId}
        onBack={() => setMobileView("list")}
      />
    </div>
  );
}
