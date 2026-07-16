import { useState } from "react";
import ArticleList from "@/components/ArticleList";
import ArticleReader from "@/components/ArticleReader";
import FeedSidebar from "@/components/FeedSidebar";
import type { Selection } from "@/lib/selection";
import { cn } from "@/lib/utils";

// Below the md breakpoint, only one pane is visible at a time — this tracks
// which, so phone/tablet gets a real single-pane navigable view (PLAN §13
// Phase 8) instead of three squeezed-together columns. Unused at md+, where
// all three panes show simultaneously regardless of this state.
type MobileView = "sidebar" | "list" | "reader";

export default function Reader() {
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("sidebar");

  return (
    <div className="flex h-screen flex-col bg-neutral-50 text-neutral-900 md:flex-row">
      <FeedSidebar
        className={cn("md:flex", mobileView === "sidebar" ? "flex" : "hidden")}
        selection={selection}
        onSelect={(next) => {
          setSelection(next);
          setSelectedArticleId(null);
          setMobileView("list");
        }}
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
      />
      <ArticleReader
        className={cn("md:flex", mobileView === "reader" ? "flex" : "hidden")}
        articleId={selectedArticleId}
        onBack={() => setMobileView("list")}
      />
    </div>
  );
}
