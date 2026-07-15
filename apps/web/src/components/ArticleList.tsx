import { CheckCheckIcon, StarIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArticles, useClearArticle, useReadAll, useStarArticle } from "@/lib/hooks";
import { selectionToArticlesParams, type Selection } from "@/lib/selection";
import { cn } from "@/lib/utils";

interface ArticleListProps {
  selection: Selection;
  selectedArticleId: string | null;
  onSelectArticle: (id: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ArticleList({ selection, selectedArticleId, onSelectArticle }: ArticleListProps) {
  const { feedId, tagId, view } = selectionToArticlesParams(selection);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useArticles(feedId, tagId, view);
  const starArticle = useStarArticle();
  const clearArticle = useClearArticle();
  const readAll = useReadAll();
  const articles = data?.pages.flatMap((page) => page.items) ?? [];

  // Marking-all-read is meaningless in the Cleared view (those articles are
  // already out of the reading flow).
  const canMarkAllRead = !(selection.kind === "view" && selection.view === "cleared");

  return (
    <section className="flex w-96 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <span className="text-xs font-medium text-neutral-500">Articles</span>
        {canMarkAllRead && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-neutral-500"
            onClick={() => readAll.mutate({ feedId, tagId })}
            disabled={readAll.isPending || articles.length === 0}
          >
            <CheckCheckIcon className="size-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-neutral-400">Loading articles…</p>}
        {!isLoading && articles.length === 0 && (
          <p className="p-4 text-sm text-neutral-400">
            No articles yet. New items appear here once a feed is polled.
          </p>
        )}

        {articles.map((article) => {
          const isRead = Boolean(article.readAt);
          const isCleared = Boolean(article.clearedAt);
          return (
            <div
              key={article.id}
              className={cn(
                "group relative border-b border-neutral-100",
                selectedArticleId === article.id ? "bg-neutral-100" : "hover:bg-neutral-50",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectArticle(article.id)}
                className="flex w-full flex-col gap-1 px-4 py-3 pr-16 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-neutral-500">{article.feedTitle}</span>
                  <span className="shrink-0 text-xs text-neutral-400">{formatDate(article.publishedAt)}</span>
                </div>
                <span
                  className={cn(
                    "line-clamp-2 text-sm text-neutral-900",
                    isRead ? "font-normal text-neutral-500" : "font-medium",
                  )}
                >
                  {article.title}
                </span>
                {article.excerpt && (
                  <span className="line-clamp-2 text-xs text-neutral-500">{article.excerpt}</span>
                )}
                {article.extractionStatus !== "ok" && (
                  <span className="text-xs text-amber-600">
                    {article.extractionStatus === "failed" ? "Extraction failed" : "Partial extraction"}
                  </span>
                )}
              </button>

              <div
                className={cn(
                  "absolute right-2 top-2 items-center gap-0.5",
                  article.starred ? "flex" : "hidden group-hover:flex",
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
                    className={cn("size-3.5", article.starred ? "text-amber-500" : "text-neutral-400")}
                    fill={article.starred ? "currentColor" : "none"}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  title={isCleared ? "Restore" : "Not interested"}
                  onClick={() => clearArticle.mutate({ id: article.id, cleared: !isCleared })}
                >
                  <XIcon className="size-3.5 text-neutral-400" />
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
            className="w-full py-3 text-center text-xs text-neutral-500 hover:bg-neutral-50"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </section>
  );
}
