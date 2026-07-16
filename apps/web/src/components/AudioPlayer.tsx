import { useEffect, useMemo, useRef, useState } from "react";
import { PauseIcon, PlayIcon, RotateCcwIcon, RotateCwIcon, Volume2Icon } from "lucide-react";
import { buildHighlightWords, findActiveWordIndex, TTS_PROVIDERS } from "@distill/shared";
import type { TtsProviderKind, TtsSource } from "@distill/shared";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useRequestTts,
  useSettings,
  useSummary,
  useTtsAudio,
  useTtsVoices,
  useUpdatePlaybackPosition,
  useUpdateSettings,
} from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  articleId: string;
  articleText: string;
  initialPositionSeconds: number | null;
}

const PROVIDER_LABELS: Record<TtsProviderKind, string> = {
  elevenlabs: "ElevenLabs",
  piper: "Piper (local)",
};

// ElevenLabs' own grouping — surfaced so a user's cloned/generated voices
// aren't lost in a long premade catalog (PLAN §7.4).
const VOICE_CATEGORY_GROUP_LABELS: Record<string, string> = {
  cloned: "Your voices",
  generated: "Your voices",
  professional: "Your voices",
  premade: "ElevenLabs voices",
};

const SKIP_SECONDS = 15;
const POSITION_SAVE_INTERVAL_MS = 5_000;
const PERSIST_PREFS_DELAY_MS = 600;

function selectClass() {
  return "h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AudioPlayer({ articleId, articleText, initialPositionSeconds }: AudioPlayerProps) {
  const [source, setSource] = useState<TtsSource>("full");
  const { data: summary } = useSummary(articleId);
  const hasSummary = Boolean(summary);
  // Falls back to "full" if the user's saved preference is "summary" but no
  // summary has been generated for this article yet (PLAN §7.2/§7.3).
  const effectiveSource: TtsSource = source === "summary" && !hasSummary ? "full" : source;
  // Estimated cost basis shown before generating — ElevenLabs bills
  // per character, so this is what the user is about to spend.
  const sourceCharCount = (effectiveSource === "summary" ? summary?.content : articleText)?.length ?? 0;

  const { data: audio, isLoading } = useTtsAudio(articleId, effectiveSource);
  const requestTts = useRequestTts();
  const updatePosition = useUpdatePlaybackPosition();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const loadedPrefsRef = useRef(false);
  // Set only by the actual pickers below, not inferred from state changes —
  // otherwise the load effect's own setProvider/setVoice/etc calls (async,
  // so this render's closure still holds pre-load defaults) can race a
  // state-keyed persist effect into saving those defaults over the value
  // that was just loaded (see Settings.tsx's ReaderThemePicker for the
  // full writeup of this race).
  const dirtyPrefsRef = useRef(false);
  const resumedRef = useRef(false);

  const [provider, setProvider] = useState<TtsProviderKind | undefined>(undefined);
  const [voice, setVoice] = useState<string | undefined>(undefined);
  const [speed, setSpeed] = useState(1);
  const [highlightFollowEnabled, setHighlightFollowEnabled] = useState(false);

  const effectiveProvider = provider ?? settings?.defaultTtsProvider ?? null;
  const { data: voices } = useTtsVoices(effectiveProvider);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);

  // Load saved prefs once, the first time settings arrive (RsvpReader's
  // pattern) — later refetches must not stomp a live in-panel choice.
  useEffect(() => {
    if (loadedPrefsRef.current || !settings) return;
    loadedPrefsRef.current = true;
    const prefs = settings.ttsPrefs;
    if (prefs.provider) setProvider(prefs.provider);
    if (prefs.voice) setVoice(prefs.voice);
    if (prefs.speed != null) setSpeed(prefs.speed);
    if (prefs.highlightFollowEnabled != null) setHighlightFollowEnabled(prefs.highlightFollowEnabled);
    if (prefs.source) setSource(prefs.source);
  }, [settings]);

  useEffect(() => {
    if (!dirtyPrefsRef.current) return;
    const timer = setTimeout(() => {
      updateSettings.mutate({ ttsPrefs: { provider, voice, speed, highlightFollowEnabled, source } });
    }, PERSIST_PREFS_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, voice, speed, highlightFollowEnabled, source]);

  // PLAN §7.3 — karaoke-style highlight-follow, built from the timings
  // ElevenLabs returns (null for Piper, which degrades to plain playback).
  const words = useMemo(() => (audio?.timings ? buildHighlightWords(audio.timings) : []), [audio?.timings]);
  const activeWordIndex = highlightFollowEnabled ? findActiveWordIndex(words, currentTime) : -1;
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    if (activeWordIndex < 0) return;
    wordRefs.current[activeWordIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeWordIndex]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, audio?.url]);

  // Periodically persist playback position while playing, so a reload or
  // navigating away and back resumes close to where the listener left off.
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const el = audioRef.current;
      if (el) updatePosition.mutate({ articleId, positionSeconds: el.currentTime });
    }, POSITION_SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, articleId]);

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
      updatePosition.mutate({ articleId, positionSeconds: el.currentTime });
    }
  }

  function skip(deltaSeconds: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.min(Math.max(0, el.currentTime + deltaSeconds), duration ?? el.duration ?? Infinity);
  }

  function seekTo(seconds: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    setCurrentTime(seconds);
  }

  if (isLoading) return null;

  function pickProvider(next: TtsProviderKind | undefined) {
    dirtyPrefsRef.current = true;
    setProvider(next);
    setVoice(undefined);
  }

  function pickVoice(next: string | undefined) {
    dirtyPrefsRef.current = true;
    setVoice(next);
  }

  function pickSource(next: TtsSource) {
    dirtyPrefsRef.current = true;
    setSource(next);
  }

  function pickSpeed(next: number) {
    dirtyPrefsRef.current = true;
    setSpeed(next);
  }

  function pickHighlightFollow(next: boolean) {
    dirtyPrefsRef.current = true;
    setHighlightFollowEnabled(next);
  }

  const providerVoicePicker = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={selectClass()}
        value={effectiveProvider ?? ""}
        onChange={(e) => pickProvider(e.target.value ? (e.target.value as TtsProviderKind) : undefined)}
      >
        <option value="">Default provider</option>
        {TTS_PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {PROVIDER_LABELS[p]}
          </option>
        ))}
      </select>
      {voices && voices.length > 0 && (
        <select className={selectClass()} value={voice ?? ""} onChange={(e) => pickVoice(e.target.value || undefined)}>
          <option value="">Default voice</option>
          {voices.some((v) => v.category) ? (
            Object.entries(
              voices.reduce<Record<string, typeof voices>>((groups, v) => {
                const label = VOICE_CATEGORY_GROUP_LABELS[v.category ?? ""] ?? "Other voices";
                (groups[label] ??= []).push(v);
                return groups;
              }, {}),
            ).map(([label, group]) => (
              <optgroup key={label} label={label}>
                {group.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ))
          ) : (
            voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))
          )}
        </select>
      )}
      <select
        className={selectClass()}
        value={source}
        title={hasSummary ? undefined : "Generate a summary first to narrate it instead of the full article"}
        onChange={(e) => pickSource(e.target.value as TtsSource)}
      >
        <option value="full">Full article</option>
        <option value="summary" disabled={!hasSummary}>
          AI summary
        </option>
      </select>
    </div>
  );

  return (
    <>
      {audio && (
        // Kept mounted regardless of whether the popover below is open, so
        // playback and position-tracking keep running after the user closes
        // the controls (PLAN §7.3's resume behavior).
        // eslint-disable-next-line jsx-a11y/media-has-caption -- narration, no track to caption
        <audio
          ref={audioRef}
          src={audio.url}
          crossOrigin="use-credentials"
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            if (!resumedRef.current) {
              resumedRef.current = true;
              if (initialPositionSeconds) e.currentTarget.currentTime = initialPositionSeconds;
            }
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            updatePosition.mutate({ articleId, positionSeconds: 0 });
          }}
        />
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="Listen"
          >
            <Volume2Icon className={cn("size-4", isPlaying ? "text-emerald-600" : "text-neutral-400")} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-96 flex-col gap-3">
          {providerVoicePicker}

          {!audio ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => requestTts.mutate({ articleId, provider, voice, source: effectiveSource })}
                disabled={requestTts.isPending}
              >
                <Volume2Icon className="size-4" />
                {requestTts.isPending ? "Generating audio…" : "Listen"}
              </Button>
              <span className="text-xs text-neutral-400">
                {sourceCharCount.toLocaleString()} characters
                {effectiveProvider === "elevenlabs" && " (≈ ElevenLabs credits)"}
              </span>
            </div>
          ) : (
            <>
              <span className="text-xs font-medium text-neutral-500">
                {audio.provider} {audio.voice} · {audio.charCount.toLocaleString()} characters
              </span>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="size-8" title={`Back ${SKIP_SECONDS}s`} onClick={() => skip(-SKIP_SECONDS)}>
                  <RotateCcwIcon className="size-4 text-neutral-500" />
                </Button>
                <Button variant="ghost" size="icon" className="size-9" title={isPlaying ? "Pause" : "Play"} onClick={togglePlay}>
                  {isPlaying ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
                </Button>
                <Button variant="ghost" size="icon" className="size-8" title={`Forward ${SKIP_SECONDS}s`} onClick={() => skip(SKIP_SECONDS)}>
                  <RotateCwIcon className="size-4 text-neutral-500" />
                </Button>

                <span className="w-9 shrink-0 text-right text-xs text-neutral-400">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  className="h-1 flex-1 cursor-pointer accent-neutral-700"
                  min={0}
                  max={duration ?? audio.durationSeconds ?? 0}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                />
                <span className="w-9 shrink-0 text-xs text-neutral-400">
                  {formatTime(duration ?? audio.durationSeconds ?? 0)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <select
                  className={selectClass()}
                  value={speed}
                  onChange={(e) => pickSpeed(Number(e.target.value))}
                  title="Playback speed"
                >
                  {[0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </select>

                <label
                  className={cn("flex shrink-0 items-center gap-1.5 text-xs text-neutral-500", !audio.timings && "opacity-50")}
                  title={audio.timings ? undefined : "This audio has no word timings (Piper) — highlight-follow needs ElevenLabs"}
                >
                  <input
                    type="checkbox"
                    className="size-3.5 cursor-pointer"
                    checked={highlightFollowEnabled}
                    disabled={!audio.timings}
                    onChange={(e) => pickHighlightFollow(e.target.checked)}
                  />
                  Highlight text
                </label>
              </div>

              {highlightFollowEnabled && words.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded border border-neutral-200 bg-white px-3 py-2 text-sm leading-relaxed text-neutral-700">
                  {words.map((word, i) => (
                    <span
                      key={i}
                      ref={(el) => {
                        wordRefs.current[i] = el;
                      }}
                      className={cn(
                        "cursor-pointer rounded px-0.5",
                        i === activeWordIndex ? "bg-amber-200 text-neutral-900" : "hover:bg-neutral-100",
                      )}
                      onClick={() => seekTo(word.startSeconds)}
                    >
                      {word.text}{" "}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}
