import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MailIcon,
  MailOpenIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import type { HighlightWord, SummaryDTO } from "@distill/shared";
import { Button } from "@/components/ui/button";
import AudioBar from "@/components/AudioBar";
import ListenSourceDialog from "@/components/ListenSourceDialog";
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
import { useTtsPlayback } from "@/lib/use-tts-playback";
import { cn } from "@/lib/utils";

interface ArticleReaderProps {
  articleId: string | null;
  onBack?: () => void;
  className?: string;
}

// Debounced so a quick skim-and-move-on doesn't mark every article read.
const AUTO_READ_DELAY_MS = 1200;

// Renders the exact transcript ElevenLabs actually narrated (built from its
// own per-character alignment — see tts-highlight.ts on why that, and not
// article.contentText, is the source of truth) as clickable, auto-scrolling
// word spans, replacing either the summary or full-article prose while
// read-along highlighting is active — so the currently-spoken word is
// visible directly in the open article rather than in a separate box.
function ReadAlongBlock({
  words,
  activeWordIndex,
  onWordClick,
  isDarkTheme,
}: {
  words: HighlightWord[];
  activeWordIndex: number;
  onWordClick: (seconds: number) => void;
  isDarkTheme: boolean;
}) {
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    if (activeWordIndex < 0) return;
    wordRefs.current[activeWordIndex]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeWordIndex]);

  return (
    <div className={cn("prose mt-6 max-w-none leading-relaxed", isDarkTheme ? "prose-invert" : "prose-neutral")}>
      {words.map((word, i) => (
        <span key={i}>
          <span
            ref={(el) => {
              wordRefs.current[i] = el;
            }}
            className={cn(
              "cursor-pointer rounded px-0.5",
              i === activeWordIndex ? "bg-amber-200 text-neutral-900" : "hover:bg-[var(--surface-hover)]",
            )}
            onClick={() => onWordClick(word.startSeconds)}
          >
            {word.text}
          </span>{" "}
          {word.startsNewParagraph && (
            <>
              <br />
              <br />
            </>
          )}
        </span>
      ))}
    </div>
  );
}

// Display-only — generation and the open/closed toggle both live in the
// toolbar's summary icon now (SummaryToggleButton below), so this just
// renders whatever's already been fetched.
function SummaryPanel({ summary }: { summary: SummaryDTO }) {
  const { isDark: isDarkTheme, style: theme } = useReaderTheme();

  return (
    <div className="mt-6 border-b pb-6" style={{ borderColor: theme.muted + "33" }}>
      <div className="flex items-center gap-2">
        <SparklesIcon className="size-3.5 shrink-0" style={{ color: theme.muted }} />
        <span className="text-xs font-medium tracking-wide" style={{ color: theme.muted }}>
          Summary · {summary.provider} {summary.model}
        </span>
      </div>
      <div
        className={cn("prose mt-3 max-w-none whitespace-pre-line", isDarkTheme ? "prose-invert" : "prose-neutral")}
      >
        {summary.content}
      </div>
    </div>
  );
}

// Toolbar icon replacing the old inline "Summarize" button: generates a
// summary if none exists yet, otherwise toggles the SummaryPanel below the
// title open/closed — same active-state color convention as the Listen
// icon (ListenSourceDialog) so both narration and summary controls read
// consistently at a glance.
function SummaryToggleButton({
  articleId,
  open,
  onToggle,
  onGenerated,
  mutedColor,
}: {
  articleId: string;
  open: boolean;
  onToggle: () => void;
  onGenerated: () => void;
  mutedColor: string;
}) {
  const { data: summary, isLoading } = useSummary(articleId);
  const requestSummary = useRequestSummary();
  const hasSummary = Boolean(summary);
  const active = hasSummary && open;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      title={hasSummary ? (open ? "Hide summary" : "Show summary") : "Summarize"}
      disabled={isLoading || requestSummary.isPending}
      onClick={() => {
        if (hasSummary) onToggle();
        else requestSummary.mutate({ articleId }, { onSuccess: onGenerated });
      }}
    >
      {requestSummary.isPending ? (
        <Loader2Icon className="size-4 animate-spin" style={{ color: mutedColor }} />
      ) : (
        <SparklesIcon className={cn("size-4", active && "text-emerald-600")} style={active ? undefined : { color: mutedColor }} />
      )}
    </Button>
  );
}

export default function ArticleReader({ articleId, onBack, className }: ArticleReaderProps) {
  const { data: article, isLoading, isError, refetch } = useArticle(articleId);
  const markRead = useMarkRead();
  const starArticle = useStarArticle();
  const clearArticle = useClearArticle();
  const [isRsvpOpen, setIsRsvpOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const { data: summary } = useSummary(articleId);

  const { style: theme, isDark: isDarkTheme, fontSize, fontStack } = useReaderTheme();
  // Called unconditionally (before the loading/error early-returns below)
  // since it's a hook — it tolerates a null/not-yet-loaded article itself.
  const playback = useTtsPlayback(articleId, article?.contentText ?? "", article?.playbackPositionSeconds ?? null);

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
      <main className={cn("flex flex-1 flex-col overflow-hidden", className)} style={{ backgroundColor: theme.background }}>
        {playback.audioElement}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <BookOpenIcon className="size-10" style={{ color: theme.muted }} strokeWidth={1.5} />
          <p className="text-sm" style={{ color: theme.muted }}>
            Select an article to read it here.
          </p>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={cn("flex flex-1 flex-col overflow-hidden", className)} style={{ backgroundColor: theme.background }}>
        {playback.audioElement}
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
      <main className={cn("flex flex-1 flex-col overflow-hidden", className)} style={{ backgroundColor: theme.background }}>
        {playback.audioElement}
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
    <main
      className={cn("relative flex flex-1 flex-col overflow-hidden", className)}
      style={{ backgroundColor: theme.background }}
    >
      {playback.audioElement}
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-[var(--surface-border)] px-6 py-3">
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
          <SummaryToggleButton
            articleId={article.id}
            open={summaryOpen}
            onToggle={() => setSummaryOpen((o) => !o)}
            onGenerated={() => setSummaryOpen(true)}
            mutedColor={theme.muted}
          />
          <ListenSourceDialog playback={playback} mutedColor={theme.muted} />
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
          <Button variant="ghost" size="icon" className="size-8" title="Open original" asChild>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon className="size-4" style={{ color: theme.muted }} />
            </a>
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <article
          className="mx-auto max-w-[66ch] px-6 py-8"
          style={{ fontSize, fontFamily: fontStack }}
        >
          <h1 className="min-w-0 text-2xl font-semibold" style={{ color: theme.color }}>
            {article.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" style={{ color: theme.muted }}>
            <span>{article.feedTitle}</span>
            {article.author && <span>· {article.author}</span>}
            {article.publishedAt && <span>· {new Date(article.publishedAt).toLocaleDateString()}</span>}
            {article.discussionUrl && (
              <a
                href={article.discussionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs underline underline-offset-2"
              >
                View discussion
              </a>
            )}
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
  
          {playback.activeSource === "summary" && playback.highlightActive ? (
            <ReadAlongBlock
              words={playback.words}
              activeWordIndex={playback.activeWordIndex}
              onWordClick={playback.seekTo}
              isDarkTheme={isDarkTheme}
            />
          ) : (
            summary && summaryOpen && <SummaryPanel summary={summary} />
          )}
  
          {playback.activeSource === "full" && playback.highlightActive ? (
            <ReadAlongBlock
              words={playback.words}
              activeWordIndex={playback.activeWordIndex}
              onWordClick={playback.seekTo}
              isDarkTheme={isDarkTheme}
            />
          ) : (
            <div
              className={cn("prose mt-6 max-w-none leading-relaxed", isDarkTheme ? "prose-invert" : "prose-neutral")}
              // content_html is sanitized server-side on ingest (PLAN §10.1)
              // before it is ever stored.
              dangerouslySetInnerHTML={{ __html: article.contentHtml }}
            />
          )}
        </article>
      </div>

      <AudioBar playback={playback} />

      {isRsvpOpen && (
        <RsvpReader articleId={article.id} fullText={article.contentText} onExit={() => setIsRsvpOpen(false)} />
      )}
    </main>
  );
}
