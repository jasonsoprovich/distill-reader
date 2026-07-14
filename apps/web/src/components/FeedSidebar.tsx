import { RefreshCwIcon } from "lucide-react";
import AddFeedDialog from "@/components/AddFeedDialog";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useFeeds, usePollFeed } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface FeedSidebarProps {
  selectedFeedId: string | null;
  onSelectFeed: (id: string | null) => void;
}

export default function FeedSidebar({ selectedFeedId, onSelectFeed }: FeedSidebarProps) {
  const { data: feeds = [], isLoading } = useFeeds();
  const pollFeed = usePollFeed();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <span className="text-sm font-semibold">Distill</span>
        <button
          type="button"
          onClick={() => authClient.signOut()}
          className="text-xs text-neutral-500 hover:text-neutral-900"
        >
          Sign out
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-medium text-neutral-500">Feeds</span>
        <AddFeedDialog />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <button
          type="button"
          onClick={() => onSelectFeed(null)}
          className={cn(
            "flex w-full items-center rounded-md px-2 py-1.5 text-sm",
            selectedFeedId === null ? "bg-neutral-100 font-medium" : "hover:bg-neutral-50",
          )}
        >
          All
        </button>

        {isLoading && <p className="px-2 py-1.5 text-xs text-neutral-400">Loading feeds…</p>}
        {!isLoading && feeds.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-neutral-400">No feeds yet — add one to get started.</p>
        )}

        {feeds.map((feed) => (
          <div key={feed.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelectFeed(feed.id)}
              className={cn(
                "flex flex-1 items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-sm",
                selectedFeedId === feed.id ? "bg-neutral-100 font-medium" : "hover:bg-neutral-50",
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
