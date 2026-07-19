import { useEffect, useState } from "react";
import {
  ArrowDownWideNarrowIcon,
  ArrowLeftIcon,
  ArrowUpNarrowWideIcon,
  CheckCheckIcon,
  CheckIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { ArticleSortDirection } from "@distill/shared";
import { Button } from "@/components/ui/button";
import { useArticles, useBulkArticles, useClearArticle, useMarkRead, useReadAll, useStarArticle } from "@/lib/hooks";
import { selectionToArticlesParams, type Selection } from "@/lib/selection";
import { cn } from "@/lib/utils";

interface ArticleListProps {
  selection: Selection;
  selectedArticleId: string | null;
  onSelectArticle: (id: string) => void;
  onBack?: () => void;
  className?: string;
}

const SORT_DIR_STORAGE_KEY = "distill:articleSortDir";

function loadSortDir(): ArticleSortDirection {
  if (typeof window === "undefined") return "desc";
  return window.localStorage.getItem(SORT_DIR_STORAGE_KEY) === "asc" ? "asc" : "desc";
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
  const [sortDir, setSortDir] = useState<ArticleSortDirection>(loadSortDir);
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useArticles(
    feedId,
    tagId,
    view,
    sortDir,
  );
  const markRead = useMarkRead();
  const starArticle = useStarArticle();
  const clearArticle = useClearArticle();
  const readAll = useReadAll();
  const bulkArticles = useBulkArticles();
  const articles = data?.pages.flatMap((page) => page.items) ?? [];

  // Marking-all-read is meaningless in the Removed view (those articles are
  // already out of the reading flow).
  const canMarkAllRead = !(selection.kind === "view" && selection.view === "cleared");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // True once "select all" has been used: the action bar then targets every
  // article matching this feed/tag/view server-side (via the /bulk
  // endpoint), not just what's been paged into selectedIds — otherwise
  // clearing/reading/starring "everything" in a large feed would mean
  // clicking "Load more" over and over first.
  const [selectAllScope, setSelectAllScope] = useState(false);
  const [isBulkPending, setIsBulkPending] = useState(false);
  const selectMode = selectedIds.size > 0 || selectAllScope;
  const allSelected = selectAllScope || (articles.length > 0 && articles.every((a) => selectedIds.has(a.id)));

  // Keeps selectedIds in sync with newly paged-in articles while "select
  // all" is active, so a row loaded via "Load more" after the fact renders
  // checked too and toggling it off behaves sanely.
  useEffect(() => {
    if (selectAllScope) setSelectedIds(new Set(articles.map((a) => a.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectAllScope, articles.length]);

  function toggleSortDir() {
    const next = sortDir === "desc" ? "asc" : "desc";
    setSortDir(next);
    window.localStorage.setItem(SORT_DIR_STORAGE_KEY, next);
  }

  function clearSelection() {
    setSelectAllScope(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    // Deselecting one article out of an all-matching selection can't be
    // represented for articles that aren't loaded yet, so it drops back to
    // an explicit, page-local selection instead.
    setSelectAllScope(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      clearSelection();
    } else {
      setSelectAllScope(true);
      setSelectedIds(new Set(articles.map((a) => a.id)));
    }
  }

  // Existing per-article mutations, fired once per selected id — each is
  // independently optimistic and settles by invalidating the shared
  // ["articles"] query, so N requests converge correctly without a
  // dedicated bulk endpoint (fine for the handful-to-dozens selections a
  // user makes by hand).
  async function runBulk(action: (id: string) => Promise<unknown>) {
    setIsBulkPending(true);
    try {
      await Promise.all([...selectedIds].map(action));
    } finally {
      setIsBulkPending(false);
      clearSelection();
    }
  }

  // Used instead of runBulk once "select all" is active — a single request
  // scoped to the current feedId/tagId/view, applied server-side to every
  // matching article regardless of how many pages have been fetched.
  async function runScopedBulk(action: "read" | "star" | "clear") {
    setIsBulkPending(true);
    try {
      await bulkArticles.mutateAsync({ feedId, tagId, view, action });
    } finally {
      setIsBulkPending(false);
      clearSelection();
    }
  }

  return (
    <section
      className={cn(
        "flex w-full flex-1 flex-col border-r border-[var(--surface-border)] bg-[var(--surface-bg)] md:w-96 md:flex-none md:shrink-0",
        className,
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--surface-border)] px-4">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          {selectMode ? (
            <>
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  title={allSelected ? "Deselect all" : "Select all"}
                  className="flex shrink-0 items-center justify-center p-1"
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-full border transition-colors",
                      allSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-[var(--surface-border)]",
                    )}
                  >
                    {allSelected && <CheckIcon className="size-3" />}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  title="Clear selection"
                  onClick={clearSelection}
                >
                  <XIcon className="size-4 text-[var(--surface-muted)]" />
                </Button>
                <span className="truncate text-xs font-medium text-[var(--surface-muted)]">
                  {selectAllScope ? "All selected" : `${selectedIds.size} selected`}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Mark read"
                  disabled={isBulkPending}
                  onClick={() =>
                    selectAllScope ? runScopedBulk("read") : runBulk((id) => markRead.mutateAsync({ id, read: true }))
                  }
                >
                  <CheckCheckIcon className="size-3.5 text-[var(--surface-muted)]" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Star"
                  disabled={isBulkPending}
                  onClick={() =>
                    selectAllScope
                      ? runScopedBulk("star")
                      : runBulk((id) => starArticle.mutateAsync({ id, starred: true }))
                  }
                >
                  <StarIcon className="size-3.5 text-[var(--surface-muted)]" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Remove"
                  disabled={isBulkPending}
                  onClick={() =>
                    selectAllScope
                      ? runScopedBulk("clear")
                      : runBulk((id) => clearArticle.mutateAsync({ id, cleared: true }))
                  }
                >
                  <Trash2Icon className="size-3.5 text-[var(--surface-muted)]" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-2">
                {onBack && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 md:hidden"
                    title="Back to feeds"
                    onClick={onBack}
                  >
                    <ArrowLeftIcon className="size-4 text-[var(--surface-muted)]" />
                  </Button>
                )}
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  title={allSelected ? "Deselect all" : "Select all"}
                  disabled={articles.length === 0}
                  className="flex shrink-0 items-center justify-center p-1 disabled:opacity-30"
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-full border transition-colors",
                      allSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-[var(--surface-border)]",
                    )}
                  >
                    {allSelected && <CheckIcon className="size-3" />}
                  </span>
                </button>
                <span className="truncate text-xs font-medium text-[var(--surface-muted)]">Articles</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-[var(--surface-muted)] hover:text-[var(--surface-fg)]"
                  title={sortDir === "desc" ? "Sorted newest first — click for oldest first" : "Sorted oldest first — click for newest first"}
                  onClick={toggleSortDir}
                >
                  {sortDir === "desc" ? (
                    <ArrowDownWideNarrowIcon className="size-3.5" />
                  ) : (
                    <ArrowUpNarrowWideIcon className="size-3.5" />
                  )}
                </Button>
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
              </div>
            </>
          )}
        </div>
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
                  !isChecked && "md:invisible md:group-hover:visible",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isChecked}
                  onChange={() => toggleSelected(article.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className={cn(
                    "mt-1 flex size-4 items-center justify-center rounded-full border transition-colors",
                    isChecked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-[var(--surface-border)] hover:border-[var(--surface-fg)]",
                  )}
                >
                  {isChecked && <CheckIcon className="size-3" />}
                </span>
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
