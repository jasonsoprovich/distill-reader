import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildHighlightWords,
  findActiveWordIndex,
  type HighlightWord,
  type TtsSource,
  type TtsTimings,
} from "@distill/shared";
import { useRequestTts, useSettings, useSummary, useUpdatePlaybackPosition, useUpdateSettings } from "@/lib/hooks";

export const TTS_SKIP_SECONDS = 15;
const POSITION_SAVE_INTERVAL_MS = 5_000;
const VOLUME_STORAGE_KEY = "distill:ttsVolume";

function loadStoredVolume(): number {
  if (typeof window === "undefined") return 1;
  const stored = Number(window.localStorage.getItem(VOLUME_STORAGE_KEY));
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 1;
}

export interface UseTtsPlayback {
  hasSummary: boolean;
  // Shown in the source-choice modal — ElevenLabs bills per character, so
  // this is what the user is about to spend before they commit to a choice.
  fullCharCount: number;
  summaryCharCount: number;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  chooseSource: (source: TtsSource) => void;
  isGenerating: boolean;
  generateError: string | null;

  activeSource: TtsSource | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number | null;
  volume: number;
  setVolume: (next: number) => void;
  togglePlay: () => void;
  skip: (deltaSeconds: number) => void;
  seekTo: (seconds: number) => void;
  stop: () => void;

  words: HighlightWord[];
  activeWordIndex: number;
  highlightActive: boolean;

  /** <audio> element, kept mounted regardless of bar/modal visibility so playback survives UI changes. Render it once, anywhere. */
  audioElement: ReactNode;
}

/**
 * Owns everything about narrating one article: the summary-vs-full choice
 * modal, the generate/fetch call, playback transport, and read-along
 * highlight state. Centralized in one hook (rather than a self-contained
 * <AudioPlayer> component) because its state needs to reach three different
 * places in ArticleReader's tree — the toolbar trigger, the bottom bar, and
 * the read-along content swap — which a single child component can't do
 * without either prop-drilling handlers back up or rendering into multiple
 * detached portals.
 */
export function useTtsPlayback(
  articleId: string | null,
  articleText: string,
  initialPositionSeconds: number | null,
): UseTtsPlayback {
  const { data: summary } = useSummary(articleId);
  const hasSummary = Boolean(summary);

  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const requestTts = useRequestTts();
  const updatePosition = useUpdatePlaybackPosition();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<TtsSource | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioTimings, setAudioTimings] = useState<TtsTimings | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const resumedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [volume, setVolumeState] = useState(loadStoredVolume);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, audioUrl]);

  useEffect(() => {
    if (!isPlaying || !articleId) return;
    const interval = setInterval(() => {
      const el = audioRef.current;
      if (el) updatePosition.mutate({ articleId, positionSeconds: el.currentTime });
    }, POSITION_SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, articleId]);

  // Stop and clear playback whenever the caller switches to a different
  // article (or closes the reader) — unlike the old <AudioPlayer>, which
  // unmounted and took its <audio> element with it automatically, this hook
  // is called unconditionally at the top of ArticleReader and stays mounted
  // across articleId changes, so it has to reset itself explicitly. Clearing
  // audioUrl unmounts the <audio> element on the next render, which stops
  // playback on its own — no need to reach into audioRef.current here (its
  // value may already be stale by the time this cleanup runs).
  useEffect(() => {
    return () => {
      setActiveSource(null);
      setAudioUrl(null);
      setAudioTimings(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(null);
      // Otherwise a different article's first audio load would skip its own
      // resume-to-position logic, since this ref would already be true from
      // whatever article was listened to earlier in the session.
      resumedRef.current = false;
    };
  }, [articleId]);

  const words = useMemo(() => (audioTimings ? buildHighlightWords(audioTimings) : []), [audioTimings]);
  const activeWordIndex = findActiveWordIndex(words, currentTime);
  const highlightActive = Boolean(settings?.ttsPrefs.highlightFollowEnabled) && words.length > 0;

  function setVolume(next: number) {
    setVolumeState(next);
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(next));
  }

  function openModal() {
    setGenerateError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  async function chooseSource(source: TtsSource) {
    if (!articleId) return;
    setIsModalOpen(false);
    setGenerateError(null);
    // resumedRef is intentionally NOT reset here — initialPositionSeconds
    // is a single scalar on the article, not scoped per source, so it's
    // only meaningful the first time audio loads for this article. Applying
    // it again on a later source switch (e.g. full article at 5:00 -> a
    // 90-second summary) would just seek past the new clip's end.
    try {
      const result = await requestTts.mutateAsync({
        articleId,
        voice: settings?.ttsPrefs.voice,
        model: settings?.ttsPrefs.model,
        source,
      });
      setActiveSource(source);
      setAudioUrl(result.url);
      setAudioTimings(result.timings);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(result.durationSeconds);
      if (source !== settings?.ttsPrefs.source) {
        updateSettings.mutate({ ttsPrefs: { source } });
      }
    } catch {
      setGenerateError("Couldn't generate audio — try again.");
    }
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
      if (articleId) updatePosition.mutate({ articleId, positionSeconds: el.currentTime });
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

  function stop() {
    const el = audioRef.current;
    if (el && !el.paused) el.pause();
    setActiveSource(null);
    setAudioUrl(null);
    setAudioTimings(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(null);
  }

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = settings?.ttsPrefs.speed ?? 1;
  }, [settings?.ttsPrefs.speed, audioUrl]);

  const audioElement = audioUrl ? (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- narration, no track to caption
    <audio
      ref={audioRef}
      src={audioUrl}
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
        if (articleId) updatePosition.mutate({ articleId, positionSeconds: 0 });
      }}
    />
  ) : null;

  return {
    hasSummary,
    fullCharCount: articleText.length,
    summaryCharCount: summary?.content.length ?? 0,
    isModalOpen,
    openModal,
    closeModal,
    chooseSource,
    isGenerating: requestTts.isPending,
    generateError,

    activeSource,
    isPlaying,
    currentTime,
    duration,
    volume,
    setVolume,
    togglePlay,
    skip,
    seekTo,
    stop,

    words,
    activeWordIndex,
    highlightActive,

    audioElement,
  };
}
