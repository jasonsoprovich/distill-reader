import { PauseIcon, PlayIcon, RotateCcwIcon, RotateCwIcon, Volume1Icon, Volume2Icon, VolumeXIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UseTtsPlayback } from "@/lib/use-tts-playback";
import { TTS_SKIP_SECONDS } from "@/lib/use-tts-playback";

interface AudioBarProps {
  playback: UseTtsPlayback;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function VolumeIcon({ volume }: { volume: number }) {
  if (volume === 0) return <VolumeXIcon className="size-4" />;
  if (volume < 0.5) return <Volume1Icon className="size-4" />;
  return <Volume2Icon className="size-4" />;
}

// Rendered as a normal (non-scrolling) flex sibling below the article's own
// scrollable region — see ArticleReader's flex-col wrapper — so it stays
// pinned to the bottom of the reading pane's viewport rather than scrolling
// away with the article content.
export default function AudioBar({ playback }: AudioBarProps) {
  const { activeSource, isPlaying, currentTime, duration, volume, setVolume, togglePlay, skip, seekTo, stop } =
    playback;

  if (!activeSource) return null;

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-t border-[var(--surface-border)] bg-[var(--surface-bg)] px-4 pt-2"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <Button variant="ghost" size="icon" className="size-8 shrink-0" title={`Back ${TTS_SKIP_SECONDS}s`} onClick={() => skip(-TTS_SKIP_SECONDS)}>
        <RotateCcwIcon className="size-4 text-[var(--surface-muted)]" />
      </Button>
      <Button variant="ghost" size="icon" className="size-9 shrink-0" title={isPlaying ? "Pause" : "Play"} onClick={togglePlay}>
        {isPlaying ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
      </Button>
      <Button variant="ghost" size="icon" className="size-8 shrink-0" title={`Forward ${TTS_SKIP_SECONDS}s`} onClick={() => skip(TTS_SKIP_SECONDS)}>
        <RotateCwIcon className="size-4 text-[var(--surface-muted)]" />
      </Button>

      <span className="w-9 shrink-0 text-right text-xs text-[var(--surface-muted)]">{formatTime(currentTime)}</span>
      <input
        type="range"
        className="h-1 min-w-0 flex-1 cursor-pointer"
        min={0}
        max={duration ?? 0}
        step={0.1}
        value={currentTime}
        onChange={(e) => seekTo(Number(e.target.value))}
      />
      <span className="w-9 shrink-0 text-xs text-[var(--surface-muted)]">{formatTime(duration ?? 0)}</span>

      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        <span className="text-[var(--surface-muted)]">
          <VolumeIcon volume={volume} />
        </span>
        <input
          type="range"
          className="h-1 w-16 cursor-pointer"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          title="Volume"
        />
      </div>

      <Button variant="ghost" size="icon" className="size-8 shrink-0" title="Stop listening" onClick={stop}>
        <XIcon className="size-4 text-[var(--surface-muted)]" />
      </Button>
    </div>
  );
}
