import { useEffect, useState } from "react";
import { CheckIcon, SparklesIcon, StarIcon, Trash2Icon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import AudioPlayer from "@/components/AudioPlayer";
import RsvpReader from "@/components/RsvpReader";
import {
  useArticle,
  useClearArticle,
  useMarkRead,
  useRequestSummary,
  useSettings,
  useStarArticle,
  useSummary,
} from "@/lib/hooks";
import {
  DARK_READER_THEMES,
  DEFAULT_READER_FONT_SIZE,
  DEFAULT_READER_THEME_NAME,
  READER_THEME_STYLES,
} from "@/lib/reader-theme";
import { cn } from "@/lib/utils";

interface ArticleReaderProps {
  articleId: string | null;
}

// Debounced so a quick skim-and-move-on doesn't mark every article read.
const AUTO_READ_DELAY_MS = 1200;

function SummaryPanel({ articleId, isDarkTheme }: { articleId: string; isDarkTheme: boolean }) {
  const { data: summary, isLoading } = useSummary(articleId);
  const requestSummary = useRequestSummary();

  if (isLoading) return null;

  if (!summary) {
    return (
      <div className="mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => requestSummary.mutate({ articleId })}
          disabled={requestSummary.isPending}
        >
          <SparklesIcon className="size-4" />
          {requestSummary.isPending ? "Summarizing…" : "Summarize"}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-4 rounded-md border px-4 py-3",
        isDarkTheme ? "border-neutral-700 bg-neutral-800" : "border-neutral-200 bg-neutral-50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-xs font-medium", isDarkTheme ? "text-neutral-400" : "text-neutral-500")}>
          Summary · {summary.provider} {summary.model}
        </span>
      </div>
      <p
        className={cn(
          "mt-2 whitespace-pre-line text-sm leading-relaxed",
          isDarkTheme ? "text-neutral-200" : "text-neutral-800",
        )}
      >
        {summary.content}
      </p>
    </div>
  );
}

export default function ArticleReader({ articleId }: ArticleReaderProps) {
  const { data: article, isLoading } = useArticle(articleId);
  const { data: settings } = useSettings();
  const markRead = useMarkRead();
  const starArticle = useStarArticle();
  const clearArticle = useClearArticle();
  const [isRsvpOpen, setIsRsvpOpen] = useState(false);

  const themeName = settings?.readerTheme.name ?? DEFAULT_READER_THEME_NAME;
  const fontSize = settings?.readerTheme.fontSize ?? DEFAULT_READER_FONT_SIZE;
  const theme = READER_THEME_STYLES[themeName];
  const isDarkTheme = DARK_READER_THEMES.has(themeName);

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
      <main className="flex-1 overflow-y-auto" style={{ backgroundColor: theme.background }}>
        <div className="p-6 text-sm" style={{ color: theme.muted }}>
          Select an article to read it here.
        </div>
      </main>
    );
  }

  if (isLoading || !article) {
    return (
      <main className="flex-1 overflow-y-auto" style={{ backgroundColor: theme.background }}>
        <div className="p-6 text-sm" style={{ color: theme.muted }}>
          Loading…
        </div>
      </main>
    );
  }

  const isRead = Boolean(article.readAt);
  const isCleared = Boolean(article.clearedAt);

  return (
    <main className="flex-1 overflow-y-auto" style={{ backgroundColor: theme.background }}>
      <article className="mx-auto max-w-[66ch] px-6 py-8" style={{ fontSize }}>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold" style={{ color: theme.color }}>
            {article.title}
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title="Speed-read"
              onClick={() => setIsRsvpOpen(true)}
            >
              <ZapIcon className="size-4 text-neutral-400" />
            </Button>
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
              title={isCleared ? "Restore" : "Remove from feed"}
              onClick={() => clearArticle.mutate({ id: article.id, cleared: !isCleared })}
            >
              <Trash2Icon className={cn("size-4", isCleared ? "text-destructive" : "text-neutral-400")} />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" style={{ color: theme.muted }}>
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
          <p
            className={cn(
              "mt-4 rounded-md px-3 py-2 text-sm",
              isDarkTheme ? "bg-amber-950/40 text-amber-300" : "bg-amber-50 text-amber-800",
            )}
          >
            {article.extractionStatus === "failed"
              ? "We couldn't extract this article cleanly — open the original to read it."
              : "This extraction may be incomplete — open the original if something looks missing."}
          </p>
        )}

        <SummaryPanel articleId={article.id} isDarkTheme={isDarkTheme} />
        <AudioPlayer articleId={article.id} initialPositionSeconds={article.playbackPositionSeconds} />

        <div
          className={cn("prose mt-6 max-w-none leading-relaxed", isDarkTheme ? "prose-invert" : "prose-neutral")}
          // content_html is sanitized server-side on ingest (PLAN §10.1)
          // before it is ever stored.
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />
      </article>

      {isRsvpOpen && (
        <RsvpReader articleId={article.id} fullText={article.contentText} onExit={() => setIsRsvpOpen(false)} />
      )}
    </main>
  );
}
