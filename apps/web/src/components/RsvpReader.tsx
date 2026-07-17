import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUpIcon, PauseIcon, PlayIcon, RotateCcwIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { READER_THEME_NAMES, computeOrpIndex, tokenizeForRsvp, wordDelayMultiplier } from "@distill/shared";
import type { ReaderThemeName, TtsSource } from "@distill/shared";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useSettings, useSummary, useUpdateSettings } from "@/lib/hooks";
import { READER_THEME_LABELS, RSVP_THEME_PRESETS } from "@/lib/reader-theme";
import { cn } from "@/lib/utils";

interface RsvpReaderProps {
  articleId: string;
  fullText: string;
  onExit: () => void;
}

const DEFAULT_WPM = 300;
// "Ember" (apps/web/src/lib/reader-theme.ts) is this screen's own default
// look, kept as the RSVP preset table's canonical values rather than a
// second hardcoded copy here — so picking Ember gives the rest of the app
// the same palette RSVP already defaults to.
const DEFAULT_WORD_COLOR = RSVP_THEME_PRESETS.ember.wordColor;
const DEFAULT_BACKGROUND_COLOR = RSVP_THEME_PRESETS.ember.backgroundColor;
const DEFAULT_PIVOT_COLOR = RSVP_THEME_PRESETS.ember.pivotColor;
const DEFAULT_DIM_LEVEL = 0;
const DEFAULT_PUNCTUATION_PAUSE_ENABLED = true;

// How many words a single "rewind" press steps back.
const REWIND_WORDS = 10;
// Debounce so dragging a slider doesn't fire a settings write per tick.
const PERSIST_DELAY_MS = 600;

export default function RsvpReader({ articleId, fullText, onExit }: RsvpReaderProps) {
  const { data: summary } = useSummary(articleId);
  const hasSummary = Boolean(summary);

  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const loadedPrefsRef = useRef(false);
  // Set only by the pickers below, not inferred from state changes —
  // otherwise the load effect's own setWpm/setWordColor/etc calls (async,
  // so this render's closure still holds pre-load defaults) can race a
  // state-keyed persist effect into saving those defaults over the prefs
  // that were just loaded (see Settings.tsx's ReaderThemePicker for the
  // full writeup of this race).
  const dirtyPrefsRef = useRef(false);

  const [wpm, setWpm] = useState(DEFAULT_WPM);
  const [wordColor, setWordColor] = useState(DEFAULT_WORD_COLOR);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND_COLOR);
  const [pivotColor, setPivotColor] = useState(DEFAULT_PIVOT_COLOR);
  const [dimLevel, setDimLevel] = useState(DEFAULT_DIM_LEVEL);
  const [punctuationPauseEnabled, setPunctuationPauseEnabled] = useState(DEFAULT_PUNCTUATION_PAUSE_ENABLED);
  const [source, setSource] = useState<TtsSource>("full");

  // Falls back to "full" if the saved preference is "summary" but no summary
  // has been generated for this article yet (mirrors AudioPlayer, PLAN §8.4).
  const effectiveSource: TtsSource = source === "summary" && !hasSummary ? "full" : source;
  const text = effectiveSource === "summary" && summary ? summary.content : fullText;
  const words = useMemo(() => tokenizeForRsvp(text), [text]);

  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  // Collapsed by default — playback starts immediately on open, so the
  // options grid would otherwise sit in front of the reader the whole time.
  const [showSettings, setShowSettings] = useState(false);

  // Re-tokenizing on a source switch mid-read would otherwise leave `index`
  // pointing at the wrong word (or past the end) in the new word list.
  useEffect(() => {
    setIndex(0);
  }, [text]);

  // Load saved prefs once, the first time settings arrive — later refetches
  // (e.g. from an unrelated mutation elsewhere) must not stomp live edits.
  useEffect(() => {
    if (loadedPrefsRef.current || !settings) return;
    loadedPrefsRef.current = true;
    const prefs = settings.rsvpPrefs;
    if (prefs.wpm != null) setWpm(prefs.wpm);
    if (prefs.wordColor) setWordColor(prefs.wordColor);
    if (prefs.backgroundColor) setBackgroundColor(prefs.backgroundColor);
    if (prefs.pivotColor) setPivotColor(prefs.pivotColor);
    if (prefs.dimLevel != null) setDimLevel(prefs.dimLevel);
    if (prefs.punctuationPauseEnabled != null) setPunctuationPauseEnabled(prefs.punctuationPauseEnabled);
    if (prefs.source) setSource(prefs.source);
  }, [settings]);

  useEffect(() => {
    if (!dirtyPrefsRef.current) return;
    const timer = setTimeout(() => {
      updateSettings.mutate({
        rsvpPrefs: { wpm, wordColor, backgroundColor, pivotColor, dimLevel, punctuationPauseEnabled, source },
      });
    }, PERSIST_DELAY_MS);
    return () => clearTimeout(timer);
    // updateSettings is intentionally omitted — its identity isn't stable
    // across renders and including it would re-arm the timer needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wpm, wordColor, backgroundColor, pivotColor, dimLevel, punctuationPauseEnabled, source]);

  function pickWpm(next: number) {
    dirtyPrefsRef.current = true;
    setWpm(next);
  }

  function pickWordColor(next: string) {
    dirtyPrefsRef.current = true;
    setWordColor(next);
  }

  function pickBackgroundColor(next: string) {
    dirtyPrefsRef.current = true;
    setBackgroundColor(next);
  }

  function pickPivotColor(next: string) {
    dirtyPrefsRef.current = true;
    setPivotColor(next);
  }

  // One-click default matching a reader theme's look — after this, the
  // three color pickers below still work as plain manual overrides, same as
  // if the user had never touched a preset at all.
  function pickThemePreset(themeName: ReaderThemeName) {
    const preset = RSVP_THEME_PRESETS[themeName];
    dirtyPrefsRef.current = true;
    setWordColor(preset.wordColor);
    setBackgroundColor(preset.backgroundColor);
    setPivotColor(preset.pivotColor);
  }

  const activeThemePreset = READER_THEME_NAMES.find((themeName) => {
    const preset = RSVP_THEME_PRESETS[themeName];
    return (
      preset.wordColor === wordColor &&
      preset.backgroundColor === backgroundColor &&
      preset.pivotColor === pivotColor
    );
  });

  function pickDimLevel(next: number) {
    dirtyPrefsRef.current = true;
    setDimLevel(next);
  }

  function pickPunctuationPauseEnabled(next: boolean) {
    dirtyPrefsRef.current = true;
    setPunctuationPauseEnabled(next);
  }

  function pickSource(next: TtsSource) {
    dirtyPrefsRef.current = true;
    setSource(next);
  }

  const isDone = words.length > 0 && index >= words.length;

  useEffect(() => {
    if (!isPlaying || isDone) return;
    const word = words[index];
    if (word === undefined) return;
    const baseDelayMs = 60000 / wpm;
    const delayMs = baseDelayMs * wordDelayMultiplier(word, punctuationPauseEnabled);
    const timer = setTimeout(() => setIndex((i) => i + 1), delayMs);
    return () => clearTimeout(timer);
  }, [isPlaying, isDone, index, words, wpm, punctuationPauseEnabled]);

  function togglePlay() {
    if (isDone) {
      setIndex(0);
      setIsPlaying(true);
      return;
    }
    setIsPlaying((p) => !p);
  }

  function rewind() {
    setIsPlaying(false);
    setIndex((i) => Math.max(0, i - REWIND_WORDS));
  }

  function restart() {
    setIndex(0);
    setIsPlaying(true);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onExit();
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        rewind();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone]);

  const currentWord = words[Math.min(index, words.length - 1)] ?? "";
  const pivotIdx = computeOrpIndex(currentWord);
  const before = currentWord.slice(0, pivotIdx);
  const pivot = currentWord.slice(pivotIdx, pivotIdx + 1);
  const after = currentWord.slice(pivotIdx + 1);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor }}>
      <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: "black", opacity: dimLevel }} />

      <div className="relative flex items-center justify-between px-4 py-3">
        <span className="text-sm text-neutral-400">
          {words.length ? `${Math.min(index + 1, words.length)} / ${words.length}` : "No text to read"}
        </span>
        <Button variant="ghost" size="icon" className="size-8 text-neutral-300" title="Exit (Esc)" onClick={onExit}>
          <XIcon className="size-4" />
        </Button>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-6">
        <div className="grid w-full max-w-3xl grid-cols-[1fr_auto_1fr] items-center text-5xl font-medium">
          <span className="text-right whitespace-pre" style={{ color: wordColor }}>
            {before}
          </span>
          <span className="text-center whitespace-pre" style={{ color: pivotColor }}>
            {pivot}
          </span>
          <span className="text-left whitespace-pre" style={{ color: wordColor }}>
            {after}
          </span>
        </div>
      </div>

      <div className="relative flex flex-col gap-3 border-t border-neutral-800 px-6 py-4">
        <div className="flex items-center justify-center gap-3">
          <Button variant="ghost" size="icon" className="size-9 text-neutral-300" title="Rewind" onClick={rewind}>
            <RotateCcwIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-neutral-100"
            title={isDone ? "Restart" : isPlaying ? "Pause (Space)" : "Play (Space)"}
            onClick={togglePlay}
          >
            {isDone ? <RefreshCwIcon className="size-5" /> : isPlaying ? (
              <PauseIcon className="size-5" />
            ) : (
              <PlayIcon className="size-5" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="size-9 text-neutral-300" title="Restart" onClick={restart}>
            <RefreshCwIcon className="size-4" />
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          className="mx-auto flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300"
        >
          <ChevronUpIcon className={cn("size-3.5 transition-transform", !showSettings && "rotate-180")} />
          {showSettings ? "Hide options" : "Show options"}
        </button>

        {showSettings && (
        <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-x-8 gap-y-3 text-sm text-neutral-300">
          <label className="col-span-2 flex items-center gap-3">
            <span className="w-24 shrink-0">Speed</span>
            <Slider
              value={[wpm]}
              min={100}
              max={800}
              step={10}
              onValueChange={([v]) => pickWpm(v)}
              className="flex-1"
            />
            <span className="w-16 shrink-0 text-right">{wpm} wpm</span>
          </label>

          <label className="col-span-2 flex items-center gap-3">
            <span className="w-24 shrink-0">Screen dim</span>
            <Slider
              value={[dimLevel]}
              min={0}
              max={0.9}
              step={0.05}
              onValueChange={([v]) => pickDimLevel(v)}
              className="flex-1"
            />
            <span className="w-16 shrink-0 text-right">{Math.round(dimLevel * 100)}%</span>
          </label>

          <div className="col-span-2 flex items-center gap-3">
            <span className="w-24 shrink-0">Match theme</span>
            <div className="flex flex-1 flex-wrap gap-2">
              {READER_THEME_NAMES.map((themeName) => {
                const preset = RSVP_THEME_PRESETS[themeName];
                return (
                  <button
                    key={themeName}
                    type="button"
                    title={READER_THEME_LABELS[themeName]}
                    aria-label={`Match ${READER_THEME_LABELS[themeName]} theme`}
                    aria-pressed={activeThemePreset === themeName}
                    onClick={() => pickThemePreset(themeName)}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border",
                      activeThemePreset === themeName ? "border-white" : "border-neutral-700",
                    )}
                    style={{ backgroundColor: preset.backgroundColor }}
                  >
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: preset.pivotColor }} />
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2">
            <span>Word color</span>
            <input
              type="color"
              value={wordColor}
              onChange={(e) => pickWordColor(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-neutral-700 bg-transparent"
            />
          </label>

          <label className="flex items-center gap-2">
            <span>Pivot color</span>
            <input
              type="color"
              value={pivotColor}
              onChange={(e) => pickPivotColor(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-neutral-700 bg-transparent"
            />
          </label>

          <label className="flex items-center gap-2">
            <span>Background</span>
            <input
              type="color"
              value={backgroundColor}
              onChange={(e) => pickBackgroundColor(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-neutral-700 bg-transparent"
            />
          </label>

          <label
            className="col-span-2 flex items-center gap-3"
            title={hasSummary ? undefined : "Generate a summary first to speed-read it instead of the full article"}
          >
            <span className="w-24 shrink-0">Read</span>
            <select
              className="h-8 flex-1 rounded-md border border-neutral-700 bg-transparent px-2 text-sm outline-none"
              value={source}
              onChange={(e) => pickSource(e.target.value as TtsSource)}
            >
              <option value="full">Full article</option>
              <option value="summary" disabled={!hasSummary}>
                AI summary
              </option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={punctuationPauseEnabled}
              onChange={(e) => pickPunctuationPauseEnabled(e.target.checked)}
              className="size-4 cursor-pointer"
            />
            <span>Pause on punctuation</span>
          </label>
        </div>
        )}
      </div>
    </div>
  );
}
