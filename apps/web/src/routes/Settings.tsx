import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, TrashIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { CREDENTIAL_PROVIDERS, READER_THEME_NAMES, SUMMARY_PROVIDERS, TTS_PROVIDERS } from "@distill/shared";
import type {
  CredentialProviderKind,
  ReaderFontName,
  ReaderThemeName,
  SummaryProviderKind,
  TtsProviderKind,
} from "@distill/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ApiError } from "@/lib/api";
import { useCreateCredential, useCredentials, useDeleteCredential, useSettings, useUpdateSettings } from "@/lib/hooks";
import {
  DEFAULT_READER_FONT_FAMILY,
  DEFAULT_READER_FONT_SIZE,
  DEFAULT_READER_THEME_NAME,
  READER_FONT_GROUPS,
  READER_FONT_LABELS,
  READER_FONT_STACKS,
  READER_THEME_LABELS,
  READER_THEME_STYLES,
  useReaderTheme,
} from "@/lib/reader-theme";
import { cn } from "@/lib/utils";

const KEYED_PROVIDERS = new Set<CredentialProviderKind>(["openai", "anthropic", "elevenlabs"]);

// Both providers use a self-hosted base URL instead of a key, but they're
// different services on different default ports — a shared placeholder was
// showing Ollama's address even when Piper was selected.
const BASE_URL_PLACEHOLDERS: Partial<Record<CredentialProviderKind, string>> = {
  ollama: "http://ollama:11434",
  piper: "http://piper:5000",
};

const BASE_URL_HELP: Partial<Record<CredentialProviderKind, string>> = {
  ollama: "The address of your self-hosted Ollama server.",
  piper: "The address of your self-hosted Piper HTTP server (docker/piper — run with the \"piper\" compose profile).",
};

const PROVIDER_LABELS: Record<CredentialProviderKind, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Ollama (local)",
  elevenlabs: "ElevenLabs",
  piper: "Piper (local)",
};

function selectClass() {
  return "h-9 rounded-md border border-[var(--surface-border)] bg-transparent px-3 text-sm text-[var(--surface-fg)] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
}

function AddCredentialForm() {
  const [provider, setProvider] = useState<CredentialProviderKind>("openai");
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createCredential = useCreateCredential();

  const keyed = KEYED_PROVIDERS.has(provider);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createCredential.mutateAsync({
        provider,
        label: label.trim(),
        secret: secret.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
      });
      setLabel("");
      setSecret("");
      setBaseUrl("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that credential");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-[var(--surface-border)] p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--surface-muted)]">
          Provider
          <select
            className={selectClass()}
            value={provider}
            onChange={(e) => setProvider(e.target.value as CredentialProviderKind)}
          >
            {CREDENTIAL_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-[var(--surface-muted)]">
          Label
          <Input placeholder="e.g. Personal key" value={label} onChange={(e) => setLabel(e.target.value)} required />
        </label>
      </div>

      {keyed && (
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--surface-muted)]">
          API key
          <Input
            type="password"
            placeholder="sk-…"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
          />
        </label>
      )}
      {!keyed && (
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--surface-muted)]">
          Base URL
          <Input
            placeholder={BASE_URL_PLACEHOLDERS[provider]}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            autoComplete="off"
          />
          {BASE_URL_HELP[provider] && <span className="font-normal text-[var(--surface-muted)]">{BASE_URL_HELP[provider]}</span>}
        </label>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" size="sm" className="self-start" disabled={!label.trim() || createCredential.isPending}>
        {createCredential.isPending ? "Adding…" : "Add credential"}
      </Button>
    </form>
  );
}

function CredentialsList() {
  const { data: credentials = [], isLoading } = useCredentials();
  const deleteCredential = useDeleteCredential();

  if (isLoading) return <p className="text-sm text-[var(--surface-muted)]">Loading…</p>;
  if (credentials.length === 0) return <p className="text-sm text-[var(--surface-muted)]">No credentials yet.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {credentials.map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between gap-2 rounded-md border border-[var(--surface-border)] px-3 py-2 text-sm"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline" className="border-[var(--surface-border)] text-[var(--surface-fg)]">
              {PROVIDER_LABELS[c.provider]}
            </Badge>
            <span className="truncate font-medium">{c.label}</span>
            {c.baseUrl && <span className="truncate text-xs text-[var(--surface-muted)]">{c.baseUrl}</span>}
            {c.hasSecret && <span className="text-xs text-[var(--surface-muted)]">key on file</span>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            title="Delete credential"
            onClick={() => deleteCredential.mutate(c.id)}
          >
            <TrashIcon className="size-4 text-[var(--surface-muted)]" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function DefaultProviderPicker() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  if (!settings) return null;

  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-[var(--surface-muted)]">
      Default summary provider
      <select
        className={selectClass()}
        value={settings.defaultSummaryProvider ?? ""}
        onChange={(e) =>
          updateSettings.mutate({
            defaultSummaryProvider: e.target.value ? (e.target.value as SummaryProviderKind) : null,
          })
        }
      >
        <option value="">None</option>
        {SUMMARY_PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {PROVIDER_LABELS[p]}
          </option>
        ))}
      </select>
    </label>
  );
}

function DefaultTtsProviderPicker() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  if (!settings) return null;

  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-[var(--surface-muted)]">
      Default TTS provider
      <select
        className={selectClass()}
        value={settings.defaultTtsProvider ?? ""}
        onChange={(e) =>
          updateSettings.mutate({
            defaultTtsProvider: e.target.value ? (e.target.value as TtsProviderKind) : null,
          })
        }
      >
        <option value="">None</option>
        {TTS_PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {PROVIDER_LABELS[p]}
          </option>
        ))}
      </select>
    </label>
  );
}

const PERSIST_THEME_DELAY_MS = 600;

function ReaderThemePicker() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const loadedRef = useRef(false);
  // Set only from the actual onClick/onValueChange handlers below — never
  // inferred from a state-change effect, which would also fire for the
  // setName/setFontSize/setFontFamily calls the load effect itself makes
  // (a real race: those are async, so a persist effect keyed off the same
  // state can still see this render's pre-load defaults and save over the
  // just-loaded value before the load's re-render lands).
  const dirtyRef = useRef(false);

  const [name, setName] = useState<ReaderThemeName>(DEFAULT_READER_THEME_NAME);
  const [fontSize, setFontSize] = useState(DEFAULT_READER_FONT_SIZE);
  const [fontFamily, setFontFamily] = useState<ReaderFontName>(DEFAULT_READER_FONT_FAMILY);

  useEffect(() => {
    if (loadedRef.current || !settings) return;
    loadedRef.current = true;
    const theme = settings.readerTheme;
    if (theme.name) setName(theme.name);
    if (theme.fontSize != null) setFontSize(theme.fontSize);
    if (theme.fontFamily) setFontFamily(theme.fontFamily);
  }, [settings]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = setTimeout(() => {
      updateSettings.mutate({ readerTheme: { name, fontSize, fontFamily } });
    }, PERSIST_THEME_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, fontSize, fontFamily]);

  function pickName(next: ReaderThemeName) {
    dirtyRef.current = true;
    setName(next);
  }

  function pickFontSize(next: number) {
    dirtyRef.current = true;
    setFontSize(next);
  }

  function pickFontFamily(next: ReaderFontName) {
    dirtyRef.current = true;
    setFontFamily(next);
  }

  if (!settings) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {READER_THEME_NAMES.map((themeName) => {
          const style = READER_THEME_STYLES[themeName];
          return (
            <button
              key={themeName}
              type="button"
              onClick={() => pickName(themeName)}
              className={cn(selectClass(), "px-3", name === themeName && "outline-2 outline-offset-2 outline-ring")}
              style={{ backgroundColor: style.background, color: style.color }}
            >
              {READER_THEME_LABELS[themeName]}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-3 text-xs font-medium text-[var(--surface-muted)]">
        <span className="w-16 shrink-0">Font size</span>
        <Slider value={[fontSize]} min={14} max={24} step={1} onValueChange={([v]) => pickFontSize(v)} />
        <span className="w-10 shrink-0 text-right">{fontSize}px</span>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-[var(--surface-muted)]">
        Font
        <select
          className={selectClass()}
          value={fontFamily}
          onChange={(e) => pickFontFamily(e.target.value as ReaderFontName)}
        >
          {READER_FONT_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.fonts.map((font) => (
                <option key={font} value={font} style={{ fontFamily: READER_FONT_STACKS[font] }}>
                  {READER_FONT_LABELS[font]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div
        className="rounded-md border border-[var(--surface-border)] px-3 py-3 text-sm"
        style={{ fontFamily: READER_FONT_STACKS[fontFamily], fontSize: `${fontSize}px` }}
      >
        <p className="mb-1 text-xs font-medium text-[var(--surface-muted)]" style={{ fontFamily: undefined }}>
          Preview — {READER_FONT_LABELS[fontFamily]}
        </p>
        The quick brown fox jumps over the lazy dog. 0123456789
      </div>
    </div>
  );
}

export default function Settings() {
  // Each picker below independently calls useSettings() (cheap/deduped by
  // React Query), so a load failure would otherwise just make every section
  // vanish with no explanation — this banner is the one place that says why.
  const { isError: isSettingsError, refetch: refetchSettings } = useSettings();
  const { vars } = useReaderTheme();

  return (
    <div className="min-h-screen bg-[var(--surface-bg)] text-[var(--surface-fg)]" style={vars}>
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-[var(--surface-muted)] hover:text-[var(--surface-fg)]"
        >
          <ArrowLeftIcon className="size-4" />
          Back
        </Link>

        <h1 className="text-xl font-semibold">Settings</h1>

        {isSettingsError && (
          <div className="mt-4 flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>Couldn't load your settings.</span>
            <button type="button" onClick={() => refetchSettings()} className="underline underline-offset-2">
              Retry
            </button>
          </div>
        )}

        <section className="mt-6 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--surface-fg)]">Reader theme</h2>
          <ReaderThemePicker />
        </section>

        <section className="mt-8 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--surface-fg)]">AI summaries</h2>
          <DefaultProviderPicker />
        </section>

        <section className="mt-8 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--surface-fg)]">Audio narration (TTS)</h2>
          <p className="text-xs text-[var(--surface-muted)]">
            Voice and playback speed are set from the Listen panel on each article.
          </p>
          <DefaultTtsProviderPicker />
        </section>

        <section className="mt-8 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--surface-fg)]">API credentials</h2>
          <p className="text-xs text-[var(--surface-muted)]">
            Keys are encrypted at rest and never shown again after saving. Ollama/Piper use a base URL instead of a
            key.
          </p>
          <CredentialsList />
          <AddCredentialForm />
        </section>
      </div>
    </div>
  );
}
