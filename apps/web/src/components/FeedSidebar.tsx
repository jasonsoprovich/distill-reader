import { useMemo, useState } from "react";
import { ArrowDownAZIcon, ArrowDownWideNarrowIcon, ArrowUpNarrowWideIcon, RefreshCwIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { Link } from "react-router-dom";
import AddFeedDialog from "@/components/AddFeedDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { useDeleteFeed, useFeeds, usePollFeed, useTags } from "@/lib/hooks";
import type { Selection } from "@/lib/selection";
import { cn } from "@/lib/utils";
import type { ArticleView, FeedDTO } from "@distill/shared";

interface FeedSidebarProps {
  selection: Selection;
  onSelect: (selection: Selection) => void;
  className?: string;
}

const SMART_VIEWS: { view: ArticleView; label: string }[] = [
  { view: "unread", label: "Unread" },
  { view: "starred", label: "Starred" },
  { view: "cleared", label: "Removed" },
];

type FeedSortMode = "title" | "date-desc" | "date-asc";

const FEED_SORT_STORAGE_KEY = "distill:feedSortMode";

const FEED_SORT_CYCLE: Record<FeedSortMode, FeedSortMode> = {
  title: "date-desc",
  "date-desc": "date-asc",
  "date-asc": "title",
};

const FEED_SORT_LABELS: Record<FeedSortMode, string> = {
  title: "Sorted A–Z — click for newest first",
  "date-desc": "Sorted newest first — click for oldest first",
  "date-asc": "Sorted oldest first — click to sort A–Z",
};

function loadFeedSortMode(): FeedSortMode {
  if (typeof window === "undefined") return "title";
  const stored = window.localStorage.getItem(FEED_SORT_STORAGE_KEY);
  return stored === "date-desc" || stored === "date-asc" || stored === "title" ? stored : "title";
}

function sortFeeds(feeds: FeedDTO[], mode: FeedSortMode): FeedDTO[] {
  const sorted = [...feeds];
  if (mode === "date-desc") {
    sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else if (mode === "date-asc") {
    sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } else {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  }
  return sorted;
}

function DeleteFeedButton({ feed, onDeleted }: { feed: FeedDTO; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const deleteFeed = useDeleteFeed();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-6 shrink-0 text-[var(--surface-muted)] hover:text-destructive group-hover:inline-flex"
          title="Delete feed"
          onClick={(e) => e.stopPropagation()}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete "{feed.title}"?</DialogTitle>
          <DialogDescription>
            This removes the feed and all of its articles — read, starred, and removed ones included. This can't be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteFeed.isPending}
            onClick={() =>
              deleteFeed.mutate(feed.id, {
                onSuccess: () => {
                  setOpen(false);
                  onDeleted();
                },
              })
            }
          >
            {deleteFeed.isPending ? "Deleting…" : "Delete feed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function navButtonClass(active: boolean) {
  return cn(
    "flex w-full items-center rounded-md px-2 py-1.5 text-sm",
    active ? "bg-[var(--surface-active)] font-medium" : "hover:bg-[var(--surface-hover)]",
  );
}

export default function FeedSidebar({ selection, onSelect, className }: FeedSidebarProps) {
  const { data: feeds = [], isLoading, isError, refetch: refetchFeeds } = useFeeds();
  const { data: tags = [] } = useTags();
  const pollFeed = usePollFeed();
  const [sortMode, setSortMode] = useState<FeedSortMode>(loadFeedSortMode);
  const sortedFeeds = useMemo(() => sortFeeds(feeds, sortMode), [feeds, sortMode]);

  function cycleSortMode() {
    const next = FEED_SORT_CYCLE[sortMode];
    setSortMode(next);
    window.localStorage.setItem(FEED_SORT_STORAGE_KEY, next);
  }

  const SortIcon =
    sortMode === "title" ? ArrowDownAZIcon : sortMode === "date-desc" ? ArrowDownWideNarrowIcon : ArrowUpNarrowWideIcon;

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-r border-[var(--surface-border)] bg-[var(--surface-bg)] md:w-64",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-4 py-3">
        <span className="text-sm font-semibold">Distill</span>
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            title="Settings"
            className="text-[var(--surface-muted)] hover:text-[var(--surface-fg)]"
          >
            <SettingsIcon className="size-4" />
          </Link>
          <button
            type="button"
            onClick={() => authClient.signOut()}
            className="text-xs text-[var(--surface-muted)] hover:text-[var(--surface-fg)]"
          >
            Sign out
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <button type="button" onClick={() => onSelect({ kind: "all" })} className={navButtonClass(selection.kind === "all")}>
          All
        </button>
        {SMART_VIEWS.map((sv) => (
          <button
            key={sv.view}
            type="button"
            onClick={() => onSelect({ kind: "view", view: sv.view })}
            className={navButtonClass(selection.kind === "view" && selection.view === sv.view)}
          >
            {sv.label}
          </button>
        ))}

        {tags.length > 0 && (
          <>
            <div className="mt-4 px-2 pb-1 text-xs font-medium text-[var(--surface-muted)]">Tags</div>
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => onSelect({ kind: "tag", id: tag.id })}
                className={navButtonClass(selection.kind === "tag" && selection.id === tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </>
        )}

        <div className="mt-4 flex items-center justify-between px-2 pb-1">
          <span className="text-xs font-medium text-[var(--surface-muted)]">Feeds</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-[var(--surface-muted)] hover:text-[var(--surface-fg)]"
              title={FEED_SORT_LABELS[sortMode]}
              onClick={cycleSortMode}
            >
              <SortIcon className="size-3.5" />
            </Button>
            <AddFeedDialog />
          </div>
        </div>

        {isLoading && <p className="px-2 py-1.5 text-xs text-[var(--surface-muted)]">Loading feeds…</p>}
        {isError && (
          <div className="flex flex-col items-start gap-1 px-2 py-1.5 text-xs text-destructive">
            <span>Couldn't load feeds.</span>
            <button type="button" onClick={() => refetchFeeds()} className="underline underline-offset-2">
              Retry
            </button>
          </div>
        )}
        {!isLoading && !isError && feeds.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-[var(--surface-muted)]">No feeds yet — add one to get started.</p>
        )}

        {sortedFeeds.map((feed) => (
          <div key={feed.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect({ kind: "feed", id: feed.id })}
              className={cn(
                "flex flex-1 items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-sm",
                selection.kind === "feed" && selection.id === feed.id
                  ? "bg-[var(--surface-active)] font-medium"
                  : "hover:bg-[var(--surface-hover)]",
              )}
              title={feed.lastError ?? undefined}
            >
              {feed.faviconUrl && (
                <img src={feed.faviconUrl} alt="" className="size-3.5 shrink-0" loading="lazy" />
              )}
              <span className="truncate">{feed.title}</span>
              {feed.consecutiveFailures > 0 && <span className="text-destructive">!</span>}
            </button>
            {feed.unreadCount > 0 && (
              <span className="shrink-0 pr-2 text-xs text-[var(--surface-muted)]">{feed.unreadCount}</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="hidden size-6 shrink-0 group-hover:inline-flex"
              onClick={() => pollFeed.mutate(feed.id)}
              disabled={pollFeed.isPending}
              title="Refresh feed"
            >
              <RefreshCwIcon className="size-3.5" />
            </Button>
            <DeleteFeedButton
              feed={feed}
              onDeleted={() => {
                if (selection.kind === "feed" && selection.id === feed.id) onSelect({ kind: "all" });
              }}
            />
          </div>
        ))}
      </nav>
    </aside>
  );
}
