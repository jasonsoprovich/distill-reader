import { useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import ArticleList from "@/components/ArticleList";
import ArticleReader from "@/components/ArticleReader";
import FeedSidebar from "@/components/FeedSidebar";
import { useReaderTheme } from "@/lib/reader-theme";
import type { Selection } from "@/lib/selection";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

// Below the md breakpoint, only one pane is visible at a time — this tracks
// which, so phone/tablet gets a real single-pane navigable view (PLAN §13
// Phase 8) instead of three squeezed-together columns. Unused at md+, where
// all three panes show simultaneously regardless of this state.
type MobileView = "sidebar" | "list" | "reader";

// Matches Tailwind's default `md` breakpoint — the same threshold every
// other `md:` class in this component (and its children) already resizes
// around, so the JS-driven layout switch below lines up with the CSS one.
const DESKTOP_QUERY = "(min-width: 768px)";

const SEPARATOR_CLASS =
  "w-1 shrink-0 cursor-col-resize bg-[var(--surface-border)] transition-colors hover:bg-[var(--surface-active)] active:bg-[var(--surface-active)]";

export default function Reader() {
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("sidebar");
  const { vars } = useReaderTheme();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  // Desktop-only: mobile is a single visible pane at a time, where
  // per-pane widths don't apply. Two separate component trees (rather than
  // one shared tree toggled by CSS) so ArticleReader/AudioPlayer — which
  // deliberately keeps its <audio> element mounted across popover
  // open/close for uninterrupted playback — is never mounted twice at once.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "distill-reader-panel-layout",
    storage: typeof window === "undefined" ? undefined : window.localStorage,
  });

  function selectAndAdvance(next: Selection) {
    setSelection(next);
    setSelectedArticleId(null);
    setMobileView("list");
  }

  function selectArticle(id: string) {
    setSelectedArticleId(id);
    setMobileView("reader");
  }

  if (isDesktop) {
    return (
      <Group
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="flex h-screen bg-[var(--surface-bg)] text-[var(--surface-fg)]"
        style={vars}
      >
        <Panel id="sidebar" defaultSize={18} minSize={12} maxSize={35}>
          <FeedSidebar className="flex h-full" selection={selection} onSelect={selectAndAdvance} />
        </Panel>
        <Separator className={SEPARATOR_CLASS} />
        <Panel id="list" defaultSize={30} minSize={18} maxSize={50}>
          <ArticleList
            className="flex h-full"
            selection={selection}
            selectedArticleId={selectedArticleId}
            onSelectArticle={selectArticle}
          />
        </Panel>
        <Separator className={SEPARATOR_CLASS} />
        <Panel id="reader" defaultSize={52} minSize={30}>
          <ArticleReader className="flex h-full" articleId={selectedArticleId} />
        </Panel>
      </Group>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--surface-bg)] text-[var(--surface-fg)]" style={vars}>
      <FeedSidebar
        className={cn(mobileView === "sidebar" ? "flex" : "hidden")}
        selection={selection}
        onSelect={selectAndAdvance}
      />
      <ArticleList
        className={cn(mobileView === "list" ? "flex" : "hidden")}
        selection={selection}
        selectedArticleId={selectedArticleId}
        onSelectArticle={selectArticle}
        onBack={() => setMobileView("sidebar")}
      />
      <ArticleReader
        className={cn(mobileView === "reader" ? "flex" : "hidden")}
        articleId={selectedArticleId}
        onBack={() => setMobileView("list")}
      />
    </div>
  );
}
