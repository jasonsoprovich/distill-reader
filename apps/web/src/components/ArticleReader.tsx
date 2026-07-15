import { useEffect } from "react";
import { CheckIcon, StarIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArticle, useClearArticle, useMarkRead, useStarArticle } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface ArticleReaderProps {
  articleId: string | null;
}

// Debounced so a quick skim-and-move-on doesn't mark every article read.
const AUTO_READ_DELAY_MS = 1200;

export default function ArticleReader({ articleId }: ArticleReaderProps) {
  const { data: article, isLoading } = useArticle(articleId);
  const markRead = useMarkRead();
  const starArticle = useStarArticle();
  const clearArticle = useClearArticle();

  useEffect(() => {
    if (!article || article.readAt) return;
    const timer = setTimeout(() => {
      markRead.mutate({ id: article.id, read: true });
    }, AUTO_READ_DELAY_MS);
    return () => clearTimeout(timer);
    // markRead is intentionally omitted — its identity isn't stable across
    // renders and including it would re-arm the timer needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id, article?.readAt]);

  if (!articleId) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 text-sm text-neutral-400">Select an article to read it here.</div>
      </main>
    );
  }

  if (isLoading || !article) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 text-sm text-neutral-400">Loading…</div>
      </main>
    );
  }

  const isRead = Boolean(article.readAt);
  const isCleared = Boolean(article.clearedAt);

  return (
    <main className="flex-1 overflow-y-auto">
      <article className="mx-auto max-w-[66ch] px-6 py-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-neutral-900">{article.title}</h1>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={isRead ? "Mark unread" : "Mark read"}
              onClick={() => markRead.mutate({ id: article.id, read: !isRead })}
            >
              <CheckIcon className={cn("size-4", isRead ? "text-emerald-600" : "text-neutral-400")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={article.starred ? "Unstar" : "Star"}
              onClick={() => starArticle.mutate({ id: article.id, starred: !article.starred })}
            >
              <StarIcon
                className={cn("size-4", article.starred ? "text-amber-500" : "text-neutral-400")}
                fill={article.starred ? "currentColor" : "none"}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={isCleared ? "Restore" : "Not interested"}
              onClick={() => clearArticle.mutate({ id: article.id, cleared: !isCleared })}
            >
              <XIcon className={cn("size-4", isCleared ? "text-destructive" : "text-neutral-400")} />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <span>{article.feedTitle}</span>
          {article.author && <span>· {article.author}</span>}
          {article.publishedAt && <span>· {new Date(article.publishedAt).toLocaleDateString()}</span>}
          <span className="ml-auto flex items-center gap-3">
            {article.discussionUrl && (
              <a
                href={article.discussionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline underline-offset-2"
              >
                View discussion
              </a>
            )}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline underline-offset-2"
            >
              Open original
            </a>
          </span>
        </div>

        {article.extractionStatus !== "ok" && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {article.extractionStatus === "failed"
              ? "We couldn't extract this article cleanly — open the original to read it."
              : "This extraction may be incomplete — open the original if something looks missing."}
          </p>
        )}

        <div
          className="prose prose-neutral mt-6 max-w-none leading-relaxed"
          // content_html is sanitized server-side on ingest (PLAN §10.1)
          // before it is ever stored.
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />
      </article>
    </main>
  );
}
