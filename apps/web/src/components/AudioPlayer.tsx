import { useEffect, useMemo, useRef, useState } from "react";
import { PauseIcon, PlayIcon, RotateCcwIcon, RotateCwIcon, Volume2Icon } from "lucide-react";
import { buildHighlightWords, findActiveWordIndex, TTS_PROVIDERS } from "@distill/shared";
import type { TtsProviderKind } from "@distill/shared";
import { Button } from "@/components/ui/button";
import {
  useRequestTts,
  useSettings,
  useTtsAudio,
  useTtsVoices,
  useUpdatePlaybackPosition,
  useUpdateSettings,
} from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  articleId: string;
  initialPositionSeconds: number | null;
}

const PROVIDER_LABELS: Record<TtsProviderKind, string> = {
  elevenlabs: "ElevenLabs",
  piper: "Piper (local)",
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

export default function AudioPlayer({ articleId, initialPositionSeconds }: AudioPlayerProps) {
  const { data: audio, isLoading } = useTtsAudio(articleId);
  const requestTts = useRequestTts();
  const updatePosition = useUpdatePlaybackPosition();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const loadedPrefsRef = useRef(false);
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
  }, [settings]);

  useEffect(() => {
    if (!loadedPrefsRef.current || !provider) return;
    const timer = setTimeout(() => {
      updateSettings.mutate({ ttsPrefs: { provider, voice, speed, highlightFollowEnabled } });
    }, PERSIST_PREFS_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, voice, speed, highlightFollowEnabled]);

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

  const providerVoicePicker = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={selectClass()}
        value={effectiveProvider ?? ""}
        onChange={(e) => {
          setProvider(e.target.value ? (e.target.value as TtsProviderKind) : undefined);
          setVoice(undefined);
        }}
      >
        <option value="">Default provider</option>
        {TTS_PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {PROVIDER_LABELS[p]}
          </option>
        ))}
      </select>
      {voices && voices.length > 0 && (
        <select className={selectClass()} value={voice ?? ""} onChange={(e) => setVoice(e.target.value || undefined)}>
          <option value="">Default voice</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  if (!audio) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        {providerVoicePicker}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => requestTts.mutate({ articleId, provider, voice })}
          disabled={requestTts.isPending}
        >
          <Volume2Icon className="size-4" />
          {requestTts.isPending ? "Generating audio…" : "Listen"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- narration, no track to caption */}
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

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-neutral-500">
          Listen · {audio.provider} {audio.voice}
        </span>
        {providerVoicePicker}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-8" title={`Back ${SKIP_SECONDS}s`} onClick={() => skip(-SKIP_SECONDS)}>
          <RotateCcwIcon className="size-4 text-neutral-500" />
        </Button>
        <Button variant="ghost" size="icon" className="size-9" title={isPlaying ? "Pause" : "Play"} onClick={togglePlay}>
          {isPlaying ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
        </Button>
        <Button variant="ghost" size="icon" className="size-8" title={`Forward ${SKIP_SECONDS}s`} onClick={() => skip(SKIP_SECONDS)}>
          <RotateCwIcon className="size-4 text-neutral-500" />
        </Button>

        <span className="w-10 shrink-0 text-right text-xs text-neutral-400">{formatTime(currentTime)}</span>
        <input
          type="range"
          className="h-1 flex-1 cursor-pointer accent-neutral-700"
          min={0}
          max={duration ?? audio.durationSeconds ?? 0}
          step={0.1}
          value={currentTime}
          onChange={(e) => seekTo(Number(e.target.value))}
        />
        <span className="w-10 shrink-0 text-xs text-neutral-400">{formatTime(duration ?? audio.durationSeconds ?? 0)}</span>

        <select
          className={selectClass()}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          title="Playback speed"
        >
          {[0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>

        <label
          className={cn(
            "flex shrink-0 items-center gap-1.5 text-xs text-neutral-500",
            !audio.timings && "opacity-50",
          )}
          title={audio.timings ? undefined : "This audio has no word timings (Piper) — highlight-follow needs ElevenLabs"}
        >
          <input
            type="checkbox"
            className="size-3.5 cursor-pointer"
            checked={highlightFollowEnabled}
            disabled={!audio.timings}
            onChange={(e) => setHighlightFollowEnabled(e.target.checked)}
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
    </div>
  );
}
