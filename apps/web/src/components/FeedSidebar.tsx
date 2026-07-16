import { RefreshCwIcon, SettingsIcon } from "lucide-react";
import { Link } from "react-router-dom";
import AddFeedDialog from "@/components/AddFeedDialog";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useFeeds, usePollFeed, useTags } from "@/lib/hooks";
import type { Selection } from "@/lib/selection";
import { cn } from "@/lib/utils";
import type { ArticleView } from "@distill/shared";

interface FeedSidebarProps {
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

const SMART_VIEWS: { view: ArticleView; label: string }[] = [
  { view: "unread", label: "Unread" },
  { view: "starred", label: "Starred" },
  { view: "cleared", label: "Removed" },
];

function navButtonClass(active: boolean) {
  return cn(
    "flex w-full items-center rounded-md px-2 py-1.5 text-sm",
    active ? "bg-neutral-100 font-medium" : "hover:bg-neutral-50",
  );
}

export default function FeedSidebar({ selection, onSelect }: FeedSidebarProps) {
  const { data: feeds = [], isLoading } = useFeeds();
  const { data: tags = [] } = useTags();
  const pollFeed = usePollFeed();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <span className="text-sm font-semibold">Distill</span>
        <div className="flex items-center gap-3">
          <Link to="/settings" title="Settings" className="text-neutral-500 hover:text-neutral-900">
            <SettingsIcon className="size-4" />
          </Link>
          <button
            type="button"
            onClick={() => authClient.signOut()}
            className="text-xs text-neutral-500 hover:text-neutral-900"
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
            <div className="mt-4 px-2 pb-1 text-xs font-medium text-neutral-500">Tags</div>
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
          <span className="text-xs font-medium text-neutral-500">Feeds</span>
          <AddFeedDialog />
        </div>

        {isLoading && <p className="px-2 py-1.5 text-xs text-neutral-400">Loading feeds…</p>}
        {!isLoading && feeds.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-neutral-400">No feeds yet — add one to get started.</p>
        )}

        {feeds.map((feed) => (
          <div key={feed.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect({ kind: "feed", id: feed.id })}
              className={cn(
                "flex flex-1 items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-sm",
                selection.kind === "feed" && selection.id === feed.id ? "bg-neutral-100 font-medium" : "hover:bg-neutral-50",
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
              <span className="shrink-0 pr-2 text-xs text-neutral-400">{feed.unreadCount}</span>
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
          </div>
        ))}
      </nav>
    </aside>
  );
}
