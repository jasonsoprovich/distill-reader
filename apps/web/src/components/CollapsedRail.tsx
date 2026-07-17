import { PanelLeftOpenIcon } from "lucide-react";

interface CollapsedRailProps {
  onExpandSidebar: () => void;
  onExpandList: () => void;
}

// Rendered instead of FeedSidebar's and ArticleList's own collapsed strips
// when both are collapsed at once — two adjacent 48px bordered columns read
// as a layout glitch rather than a deliberate state, so this merges them
// into a single rail with one expand control per pane. Desktop-only (md+);
// collapse doesn't apply on mobile, where FeedSidebar/ArticleList render
// full-width one at a time regardless of this component.
export default function CollapsedRail({ onExpandSidebar, onExpandList }: CollapsedRailProps) {
  return (
    <aside className="hidden w-12 shrink-0 flex-col border-r border-[var(--surface-border)] bg-[var(--surface-bg)] md:flex">
      <button
        type="button"
        onClick={onExpandSidebar}
        title="Expand sidebar"
        className="flex h-14 shrink-0 items-center justify-center border-b border-[var(--surface-border)] text-[var(--surface-muted)] hover:text-[var(--surface-fg)]"
      >
        <PanelLeftOpenIcon className="size-4" />
      </button>
      <button
        type="button"
        onClick={onExpandList}
        title="Expand article list"
        className="flex h-14 shrink-0 items-center justify-center text-[var(--surface-muted)] hover:text-[var(--surface-fg)]"
      >
        <PanelLeftOpenIcon className="size-4" />
      </button>
    </aside>
  );
}
