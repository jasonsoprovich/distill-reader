import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZIcon,
  ArrowDownZAIcon,
  LogOutIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  RefreshCcwDotIcon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";
import { Link } from "react-router-dom";
import AddFeedDialog from "@/components/AddFeedDialog";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import {
  useCreateTag,
  useDeleteFeed,
  useDeleteTag,
  useFeeds,
  usePollFeed,
  useRefreshAllFeeds,
  useTags,
  useUpdateFeed,
  useUpdateTag,
} from "@/lib/hooks";
import type { Selection } from "@/lib/selection";
import { cn } from "@/lib/utils";
import type { ArticleView, FeedDTO, TagDTO } from "@distill/shared";

interface FeedSidebarProps {
  selection: Selection;
  onSelect: (selection: Selection) => void;
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const SMART_VIEWS: { view: ArticleView; label: string }[] = [
  { view: "unread", label: "Unread" },
  { view: "starred", label: "Starred" },
  { view: "cleared", label: "Removed" },
];

type FeedSortMode = "title-asc" | "title-desc";

const FEED_SORT_STORAGE_KEY = "distill:feedSortMode";

const FEED_SORT_CYCLE: Record<FeedSortMode, FeedSortMode> = {
  "title-asc": "title-desc",
  "title-desc": "title-asc",
};

const FEED_SORT_LABELS: Record<FeedSortMode, string> = {
  "title-asc": "Sorted A–Z — click for Z–A",
  "title-desc": "Sorted Z–A — click for A–Z",
};

function loadFeedSortMode(): FeedSortMode {
  if (typeof window === "undefined") return "title-asc";
  const stored = window.localStorage.getItem(FEED_SORT_STORAGE_KEY);
  return stored === "title-desc" ? "title-desc" : "title-asc";
}

function sortFeeds(feeds: FeedDTO[], mode: FeedSortMode): FeedDTO[] {
  const sorted = [...feeds];
  sorted.sort((a, b) => (mode === "title-desc" ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title)));
  return sorted;
}

function EditFeedDialog({ feed }: { feed: FeedDTO }) {
  const [open, setOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: tags = [] } = useTags();
  const createTag = useCreateTag();
  const updateFeed = useUpdateFeed();

  // Re-seed from the feed's current tags each time the dialog opens, not
  // just on first mount — otherwise a previous edit session's leftover
  // selection would resurface next time this same dialog instance opens.
  useEffect(() => {
    if (open) setSelectedTagIds(feed.tags.map((t) => t.id));
  }, [open, feed.tags]);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    try {
      const created = await createTag.mutateAsync({ name: newTagName.trim() });
      setSelectedTagIds((prev) => [...prev, created.id]);
      setNewTagName("");
    } catch {
      // useCreateTag's onError already surfaces a toast.
    }
  }

  async function handleSave() {
    setError(null);
    try {
      await updateFeed.mutateAsync({ id: feed.id, patch: { tagIds: selectedTagIds } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update that feed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-6 shrink-0 text-[var(--surface-muted)] hover:text-[var(--surface-fg)] group-hover:inline-flex"
          title="Edit tags"
          onClick={(e) => e.stopPropagation()}
        >
          <PencilIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit "{feed.title}" tags</DialogTitle>
          <DialogDescription>Add or remove tags for this feed.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet.</span>}
            {tags.map((t) => (
              <button key={t.id} type="button" onClick={() => toggleTag(t.id)}>
                <Badge variant={selectedTagIds.includes(t.id) ? "default" : "outline"}>{t.name}</Badge>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="New tag"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateTag}
              disabled={!newTagName.trim() || createTag.isPending}
            >
              Add tag
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateFeed.isPending}>
            {updateFeed.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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

function EditTagButton({ tag }: { tag: TagDTO }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);
  const updateTag = useUpdateTag();

  useEffect(() => {
    if (open) setName(tag.name);
  }, [open, tag.name]);

  async function handleSave() {
    setError(null);
    if (!name.trim()) return;
    try {
      await updateTag.mutateAsync({ id: tag.id, patch: { name: name.trim() } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not rename that tag");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-6 shrink-0 text-[var(--surface-muted)] hover:text-[var(--surface-fg)] group-hover:inline-flex"
          title="Rename tag"
          onClick={(e) => e.stopPropagation()}
        >
          <PencilIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename tag</DialogTitle>
          <DialogDescription>This renames "{tag.name}" everywhere it's used.</DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          autoFocus
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || updateTag.isPending}>
            {updateTag.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTagButton({ tag, onDeleted }: { tag: TagDTO; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const deleteTag = useDeleteTag();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-6 shrink-0 text-[var(--surface-muted)] hover:text-destructive group-hover:inline-flex"
          title="Delete tag"
          onClick={(e) => e.stopPropagation()}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete "{tag.name}"?</DialogTitle>
          <DialogDescription>
            This removes the tag from every feed it's applied to. The feeds and their articles are unaffected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteTag.isPending}
            onClick={() =>
              deleteTag.mutate(tag.id, {
                onSuccess: () => {
                  setOpen(false);
                  onDeleted();
                },
              })
            }
          >
            {deleteTag.isPending ? "Deleting…" : "Delete tag"}
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

export default function FeedSidebar({
  selection,
  onSelect,
  className,
  collapsed,
  onToggleCollapse,
}: FeedSidebarProps) {
  const { data: feeds = [], isLoading, isError, refetch: refetchFeeds } = useFeeds();
  const { data: tags = [] } = useTags();
  const pollFeed = usePollFeed();
  const refreshAllFeeds = useRefreshAllFeeds();
  const [sortMode, setSortMode] = useState<FeedSortMode>(loadFeedSortMode);
  const sortedFeeds = useMemo(() => sortFeeds(feeds, sortMode), [feeds, sortMode]);

  function cycleSortMode() {
    const next = FEED_SORT_CYCLE[sortMode];
    setSortMode(next);
    window.localStorage.setItem(FEED_SORT_STORAGE_KEY, next);
  }

  const SortIcon = sortMode === "title-asc" ? ArrowDownAZIcon : ArrowDownZAIcon;

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-r border-[var(--surface-border)] bg-[var(--surface-bg)]",
        collapsed ? "md:w-12" : "md:w-64",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center justify-between border-b border-[var(--surface-border)] px-4",
          collapsed && "md:justify-center md:px-2",
        )}
      >
        <span className={cn("text-sm font-semibold", collapsed && "md:hidden")}>Distill</span>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden text-[var(--surface-muted)] hover:text-[var(--surface-fg)] md:inline-flex"
          >
            {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
          </button>
        )}
      </div>

      <nav className={cn("flex-1 overflow-y-auto px-2 py-3", collapsed && "md:hidden")}>
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
              <div key={tag.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "tag", id: tag.id })}
                  className={cn("flex-1", navButtonClass(selection.kind === "tag" && selection.id === tag.id))}
                >
                  {tag.name}
                </button>
                <EditTagButton tag={tag} />
                <DeleteTagButton
                  tag={tag}
                  onDeleted={() => {
                    if (selection.kind === "tag" && selection.id === tag.id) onSelect({ kind: "all" });
                  }}
                />
              </div>
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
              title="Refresh all feeds"
              onClick={() => refreshAllFeeds.mutate(feeds)}
              disabled={refreshAllFeeds.isPending || feeds.length === 0}
            >
              <RefreshCcwDotIcon className={cn("size-3.5", refreshAllFeeds.isPending && "animate-spin")} />
            </Button>
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
            <EditFeedDialog feed={feed} />
            <DeleteFeedButton
              feed={feed}
              onDeleted={() => {
                if (selection.kind === "feed" && selection.id === feed.id) onSelect({ kind: "all" });
              }}
            />
          </div>
        ))}
      </nav>

      <div
        className={cn(
          "flex shrink-0 items-center justify-between border-t border-[var(--surface-border)] px-4 py-2.5",
          collapsed && "md:flex-col md:gap-2 md:px-2",
        )}
      >
        <Link
          to="/settings"
          title="Settings"
          className="flex items-center gap-2 text-[var(--surface-muted)] hover:text-[var(--surface-fg)]"
        >
          <SettingsIcon className="size-4 shrink-0" />
          <span className={cn("text-sm", collapsed && "md:hidden")}>Settings</span>
        </Link>
        <button
          type="button"
          onClick={() => authClient.signOut()}
          title="Sign out"
          className="text-xs text-[var(--surface-muted)] hover:text-[var(--surface-fg)]"
        >
          {collapsed ? <LogOutIcon className="hidden size-4 md:inline-flex" /> : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
