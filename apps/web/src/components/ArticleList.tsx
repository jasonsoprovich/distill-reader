import { useState } from "react";
import { ArrowLeftIcon, CheckCheckIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArticles, useClearArticle, useMarkRead, useReadAll, useStarArticle } from "@/lib/hooks";
import { selectionToArticlesParams, type Selection } from "@/lib/selection";
import { cn } from "@/lib/utils";

interface ArticleListProps {
  selection: Selection;
  selectedArticleId: string | null;
  onSelectArticle: (id: string) => void;
  onBack?: () => void;
  className?: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ArticleList({
  selection,
  selectedArticleId,
  onSelectArticle,
  onBack,
  className,
}: ArticleListProps) {
  const { feedId, tagId, view } = selectionToArticlesParams(selection);
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useArticles(
    feedId,
    tagId,
    view,
  );
  const markRead = useMarkRead();
  const starArticle = useStarArticle();
  const clearArticle = useClearArticle();
  const readAll = useReadAll();
  const articles = data?.pages.flatMap((page) => page.items) ?? [];

  // Marking-all-read is meaningless in the Removed view (those articles are
  // already out of the reading flow).
  const canMarkAllRead = !(selection.kind === "view" && selection.view === "cleared");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkPending, setIsBulkPending] = useState(false);
  const selectMode = selectedIds.size > 0;

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Existing per-article mutations, fired once per selected id — each is
  // independently optimistic and settles by invalidating the shared
  // ["articles"] query, so N requests converge correctly without a
  // dedicated bulk endpoint (fine for the handful-to-dozens selections a
  // user makes by hand; not meant for "select thousands").
  async function runBulk(action: (id: string) => Promise<unknown>) {
    setIsBulkPending(true);
    try {
      await Promise.all([...selectedIds].map(action));
    } finally {
      setIsBulkPending(false);
      setSelectedIds(new Set());
    }
  }

  return (
    <section
      className={cn(
        "flex w-full shrink-0 flex-col border-r border-[var(--surface-border)] bg-[var(--surface-bg)] md:w-96",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-4 py-3">
        {selectMode ? (
          <>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Clear selection"
                onClick={() => setSelectedIds(new Set())}
              >
                <XIcon className="size-4 text-[var(--surface-muted)]" />
              </Button>
              <span className="text-xs font-medium text-[var(--surface-muted)]">{selectedIds.size} selected</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs text-[var(--surface-muted)]"
                disabled={isBulkPending}
                onClick={() => runBulk((id) => markRead.mutateAsync({ id, read: true }))}
              >
                <CheckCheckIcon className="size-3.5" />
                Mark read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs text-[var(--surface-muted)]"
                disabled={isBulkPending}
                onClick={() => runBulk((id) => starArticle.mutateAsync({ id, starred: true }))}
              >
                <StarIcon className="size-3.5" />
                Star
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs text-[var(--surface-muted)]"
                disabled={isBulkPending}
                onClick={() => runBulk((id) => clearArticle.mutateAsync({ id, cleared: true }))}
              >
                <Trash2Icon className="size-3.5" />
                Remove
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {onBack && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 md:hidden"
                  title="Back to feeds"
                  onClick={onBack}
                >
                  <ArrowLeftIcon className="size-4 text-[var(--surface-muted)]" />
                </Button>
              )}
              <span className="text-xs font-medium text-[var(--surface-muted)]">Articles</span>
            </div>
            {canMarkAllRead && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs text-[var(--surface-muted)]"
                onClick={() => readAll.mutate({ feedId, tagId })}
                disabled={readAll.isPending || articles.length === 0}
              >
                <CheckCheckIcon className="size-3.5" />
                Mark all read
              </Button>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-[var(--surface-muted)]">Loading articles…</p>}
        {isError && (
          <div className="flex flex-col items-start gap-1 p-4 text-sm text-destructive">
            <span>Couldn't load articles.</span>
            <button type="button" onClick={() => refetch()} className="underline underline-offset-2">
              Retry
            </button>
          </div>
        )}
        {!isLoading && !isError && articles.length === 0 && (
          <p className="p-4 text-sm text-[var(--surface-muted)]">
            No articles yet. New items appear here once a feed is polled.
          </p>
        )}

        {articles.map((article) => {
          const isRead = Boolean(article.readAt);
          const isCleared = Boolean(article.clearedAt);
          const isChecked = selectedIds.has(article.id);
          return (
            <div
              key={article.id}
              className={cn(
                "group relative flex items-stretch border-b border-[var(--surface-border)]",
                selectedArticleId === article.id ? "bg-[var(--surface-active)]" : "hover:bg-[var(--surface-hover)]",
              )}
            >
              <label
                className={cn(
                  "flex shrink-0 cursor-pointer items-start py-3 pl-3",
                  selectMode || isChecked ? "flex" : "hidden group-hover:flex",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-3.5 cursor-pointer"
                  checked={isChecked}
                  onChange={() => toggleSelected(article.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
              <button
                type="button"
                onClick={() => onSelectArticle(article.id)}
                className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-3 pr-16 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-[var(--surface-muted)]">
                    {article.feedTitle}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--surface-muted)]">
                    {formatDate(article.publishedAt)}
                  </span>
                </div>
                <span
                  className={cn(
                    "line-clamp-2 text-sm",
                    isRead ? "font-normal text-[var(--surface-muted)]" : "font-medium text-[var(--surface-fg)]",
                  )}
                >
                  {article.title}
                </span>
                {article.excerpt && (
                  <span className="line-clamp-2 text-xs text-[var(--surface-muted)]">{article.excerpt}</span>
                )}
                {article.extractionStatus !== "ok" && (
                  <span className="text-xs text-amber-600">
                    {article.extractionStatus === "failed" ? "Extraction failed" : "Partial extraction"}
                  </span>
                )}
              </button>

              <div
                className={cn(
                  // Always visible on touch/mobile (no hover to reveal them
                  // there); desktop keeps the hover-to-reveal behavior
                  // unless the article is starred.
                  "absolute right-2 top-2 flex items-center gap-0.5",
                  !article.starred && "md:hidden md:group-hover:flex",
                )}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  title={article.starred ? "Unstar" : "Star"}
                  onClick={() => starArticle.mutate({ id: article.id, starred: !article.starred })}
                >
                  <StarIcon
                    className={cn("size-3.5", article.starred ? "text-amber-500" : "text-[var(--surface-muted)]")}
                    fill={article.starred ? "currentColor" : "none"}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  title={isCleared ? "Restore" : "Remove from feed"}
                  onClick={() => clearArticle.mutate({ id: article.id, cleared: !isCleared })}
                >
                  <Trash2Icon
                    className={cn("size-3.5", isCleared ? "text-destructive" : "text-[var(--surface-muted)]")}
                  />
                </Button>
              </div>
            </div>
          );
        })}

        {hasNextPage && (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full py-3 text-center text-xs text-[var(--surface-muted)] hover:bg-[var(--surface-hover)]"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </section>
  );
}
