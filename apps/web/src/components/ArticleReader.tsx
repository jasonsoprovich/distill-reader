import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  MailIcon,
  MailOpenIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import AudioPlayer from "@/components/AudioPlayer";
import RsvpReader from "@/components/RsvpReader";
import {
  useArticle,
  useClearArticle,
  useMarkRead,
  useRequestSummary,
  useStarArticle,
  useSummary,
} from "@/lib/hooks";
import { useReaderTheme } from "@/lib/reader-theme";
import { cn } from "@/lib/utils";

interface ArticleReaderProps {
  articleId: string | null;
  onBack?: () => void;
  className?: string;
}

// Debounced so a quick skim-and-move-on doesn't mark every article read.
const AUTO_READ_DELAY_MS = 1200;

function SummaryPanel({ articleId }: { articleId: string }) {
  const { data: summary, isLoading } = useSummary(articleId);
  const requestSummary = useRequestSummary();
  const { isDark: isDarkTheme, style: theme } = useReaderTheme();
  const [open, setOpen] = useState(true);

  if (isLoading) return null;

  if (!summary) {
    return (
      <div className="mt-4">
        <Button
          variant="outline"
          size="sm"
          className="border-[var(--surface-border)] bg-[var(--surface-hover)] text-[var(--surface-fg)] hover:bg-[var(--surface-active)]"
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
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mt-6 border-b pb-6"
      style={{ borderColor: theme.muted + "33" }}
    >
      <div className="flex items-center gap-2">
        <SparklesIcon className="size-3.5 shrink-0" style={{ color: theme.muted }} />
        <span className="text-xs font-medium tracking-wide" style={{ color: theme.muted }}>
          Summary · {summary.provider} {summary.model}
        </span>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-6"
            title={open ? "Hide summary" : "Show summary"}
          >
            <ChevronDownIcon className={cn("size-4 transition-transform", !open && "-rotate-90")} />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div
          className={cn(
            "prose mt-3 max-w-none whitespace-pre-line",
            isDarkTheme ? "prose-invert" : "prose-neutral",
          )}
        >
          {summary.content}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function ArticleReader({ articleId, onBack, className }: ArticleReaderProps) {
  const { data: article, isLoading, isError, refetch } = useArticle(articleId);
  const markRead = useMarkRead();
  const starArticle = useStarArticle();
  const clearArticle = useClearArticle();
  const [isRsvpOpen, setIsRsvpOpen] = useState(false);

  const { style: theme, isDark: isDarkTheme, fontSize, fontStack } = useReaderTheme();

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
      <main className={cn("flex-1 overflow-y-auto", className)} style={{ backgroundColor: theme.background }}>
        <div className="p-6 text-sm" style={{ color: theme.muted }}>
          Select an article to read it here.
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={cn("flex-1 overflow-y-auto", className)} style={{ backgroundColor: theme.background }}>
        <div className="p-6 text-sm" style={{ color: theme.muted }}>
          Loading…
        </div>
      </main>
    );
  }

  // Without this, a failed fetch left `article` undefined and fell through
  // to the `isLoading` branch above forever — an infinite spinner with no
  // way out except navigating away.
  if (isError || !article) {
    return (
      <main className={cn("flex-1 overflow-y-auto", className)} style={{ backgroundColor: theme.background }}>
        <div className="flex flex-col gap-3 p-6 text-sm" style={{ color: theme.muted }}>
          <p>Couldn't load this article.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="self-start rounded-md border px-3 py-1.5"
            style={{ borderColor: theme.muted, color: theme.color }}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const isRead = Boolean(article.readAt);
  const isCleared = Boolean(article.clearedAt);

  return (
    <main className={cn("flex-1 overflow-y-auto", className)} style={{ backgroundColor: theme.background }}>
      <article className="mx-auto max-w-[66ch] px-6 py-8" style={{ fontSize, fontFamily: fontStack }}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-1">
            {onBack ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 md:hidden"
                title="Back to articles"
                onClick={onBack}
              >
                <ArrowLeftIcon className="size-4" style={{ color: theme.muted }} />
              </Button>
            ) : (
              <span />
            )}
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                title="Speed-read"
                onClick={() => setIsRsvpOpen(true)}
              >
                <ZapIcon className="size-4" style={{ color: theme.muted }} />
              </Button>
              <AudioPlayer
                articleId={article.id}
                articleText={article.contentText}
                initialPositionSeconds={article.playbackPositionSeconds}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                title={isRead ? "Mark unread" : "Mark read"}
                onClick={() => markRead.mutate({ id: article.id, read: !isRead })}
              >
                {isRead ? (
                  <MailOpenIcon className="size-4" style={{ color: theme.muted }} />
                ) : (
                  <MailIcon className="size-4 text-sky-500" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                title={article.starred ? "Unstar" : "Star"}
                onClick={() => starArticle.mutate({ id: article.id, starred: !article.starred })}
              >
                <StarIcon
                  className={cn("size-4", article.starred && "text-amber-500")}
                  style={{ color: article.starred ? undefined : theme.muted }}
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
                <Trash2Icon
                  className={cn("size-4", isCleared && "text-destructive")}
                  style={{ color: isCleared ? undefined : theme.muted }}
                />
              </Button>
            </div>
          </div>
          <h1 className="min-w-0 text-2xl font-semibold" style={{ color: theme.color }}>
            {article.title}
          </h1>
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

        <SummaryPanel articleId={article.id} />

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
