import { useArticles } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface ArticleListProps {
  feedId: string | null;
  selectedArticleId: string | null;
  onSelectArticle: (id: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ArticleList({ feedId, selectedArticleId, onSelectArticle }: ArticleListProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useArticles(
    feedId ?? undefined,
  );
  const articles = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="flex w-96 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <span className="text-xs font-medium text-neutral-500">Articles</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-neutral-400">Loading articles…</p>}
        {!isLoading && articles.length === 0 && (
          <p className="p-4 text-sm text-neutral-400">
            No articles yet. New items appear here once a feed is polled.
          </p>
        )}

        {articles.map((article) => (
          <button
            key={article.id}
            type="button"
            onClick={() => onSelectArticle(article.id)}
            className={cn(
              "flex w-full flex-col gap-1 border-b border-neutral-100 px-4 py-3 text-left",
              selectedArticleId === article.id ? "bg-neutral-100" : "hover:bg-neutral-50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-neutral-500">{article.feedTitle}</span>
              <span className="shrink-0 text-xs text-neutral-400">{formatDate(article.publishedAt)}</span>
            </div>
            <span className="line-clamp-2 text-sm font-medium text-neutral-900">{article.title}</span>
            {article.excerpt && <span className="line-clamp-2 text-xs text-neutral-500">{article.excerpt}</span>}
            {article.extractionStatus !== "ok" && (
              <span className="text-xs text-amber-600">
                {article.extractionStatus === "failed" ? "Extraction failed" : "Partial extraction"}
              </span>
            )}
          </button>
        ))}

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
