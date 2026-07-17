import { FileTextIcon, Loader2Icon, SparklesIcon, Volume2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { UseTtsPlayback } from "@/lib/use-tts-playback";
import { cn } from "@/lib/utils";

interface ListenSourceDialogProps {
  playback: UseTtsPlayback;
  mutedColor: string;
}

// Owns both the toolbar trigger and its popup — a Radix Popover instance
// needs its trigger and content as siblings under one Root, which is why
// this renders the icon button too rather than ArticleReader rendering it
// separately (as it did back when this was a centered Dialog with no
// positional relationship to its opener).
export default function ListenSourceDialog({ playback, mutedColor }: ListenSourceDialogProps) {
  const {
    isModalOpen,
    openModal,
    closeModal,
    chooseSource,
    hasSummary,
    fullCharCount,
    summaryCharCount,
    isGenerating,
    generateError,
    activeSource,
    isPlaying,
  } = playback;

  return (
    <Popover open={isModalOpen} onOpenChange={(next) => (next ? openModal() : closeModal())}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" title="Listen" disabled={isGenerating}>
          {isGenerating ? (
            <Loader2Icon className="size-4 animate-spin" style={{ color: mutedColor }} />
          ) : (
            <Volume2Icon
              className={cn("size-4", (isPlaying || activeSource) && "text-emerald-600")}
              style={isPlaying || activeSource ? undefined : { color: mutedColor }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-64 p-1.5">
        <button
          type="button"
          className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-50"
          disabled={!hasSummary || isGenerating}
          onClick={() => chooseSource("summary")}
        >
          <SparklesIcon className="mt-0.5 size-4 shrink-0" />
          <span className="flex flex-col">
            <span className="text-sm">AI summary</span>
            <span className="text-xs text-muted-foreground">
              {hasSummary ? `${summaryCharCount.toLocaleString()} characters` : "Generate a summary first"}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-50"
          disabled={isGenerating}
          onClick={() => chooseSource("full")}
        >
          <FileTextIcon className="mt-0.5 size-4 shrink-0" />
          <span className="flex flex-col">
            <span className="text-sm">Full article</span>
            <span className="text-xs text-muted-foreground">{fullCharCount.toLocaleString()} characters</span>
          </span>
        </button>
        {generateError && <p className="px-2 py-1.5 text-xs text-destructive">{generateError}</p>}
      </PopoverContent>
    </Popover>
  );
}
