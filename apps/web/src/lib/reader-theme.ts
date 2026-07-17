import type { CSSProperties } from "react";
import type { ReaderFontName, ReaderThemeName } from "@distill/shared";
import { useSettings } from "./hooks";

export const READER_THEME_LABELS: Record<ReaderThemeName, string> = {
  light: "Light",
  sepia: "Sepia",
  dark: "Dark",
  "high-contrast": "High contrast",
  "catppuccin-latte": "Catppuccin Latte",
  "catppuccin-mocha": "Catppuccin Mocha",
  nord: "Nord",
  ember: "Ember",
};

// PLAN §8.3 — background/text/muted-text triples per built-in theme. The
// prose body's headings/links/code get their color from Tailwind
// Typography's own prose/prose-invert variant (applied in ArticleReader)
// rather than duplicated here.
export const READER_THEME_STYLES: Record<ReaderThemeName, { background: string; color: string; muted: string }> = {
  light: { background: "#ffffff", color: "#171717", muted: "#737373" },
  sepia: { background: "#f4ecd8", color: "#3b3229", muted: "#8a7863" },
  dark: { background: "#171717", color: "#e5e5e5", muted: "#a3a3a3" },
  "high-contrast": { background: "#000000", color: "#ffffff", muted: "#d4d4d4" },
  // https://catppuccin.com/palette — Latte (light) base/text/subtext0.
  "catppuccin-latte": { background: "#eff1f5", color: "#4c4f69", muted: "#6c6f85" },
  // Catppuccin Mocha (dark) base/text/subtext0.
  "catppuccin-mocha": { background: "#1e1e2e", color: "#cdd6f4", muted: "#a6adc8" },
  // https://www.nordtheme.com/docs/colors-and-palettes — nord0/nord6/nord4.
  nord: { background: "#2e3440", color: "#eceff4", muted: "#d8dee9" },
  // A warm-neutral muted tone, not the RSVP page's orange pivot accent —
  // `muted` here drives read-article titles, byline text, icons etc.
  // app-wide (readerSurfaceVars below), so it needs to stay *dimmer* than
  // `color` the way every other theme's muted is (a toned-down version of
  // the foreground), not a brighter, differently-hued accent. RSVP's own
  // orange look is preserved separately, in RSVP_THEME_PRESETS.ember below.
  ember: { background: "#171717", color: "#f5f5f5", muted: "#a8a29e" },
};

// Speed-reader (RSVP) color defaults per theme — deliberately separate from
// READER_THEME_STYLES.muted above (that's a general-purpose secondary-text
// color; this is specifically the RSVP page's word/background/pivot triple,
// tuned per theme for legibility at large display type rather than reused
// from a role meant for small UI text). RsvpReader.tsx applies these as a
// one-click "match theme" preset; the user's own color-picker choices in
// rsvpPrefs always take precedence once set.
export const RSVP_THEME_PRESETS: Record<ReaderThemeName, { wordColor: string; backgroundColor: string; pivotColor: string }> = {
  light: { backgroundColor: "#ffffff", wordColor: "#171717", pivotColor: "#dc2626" },
  sepia: { backgroundColor: "#f4ecd8", wordColor: "#3b3229", pivotColor: "#b45309" },
  dark: { backgroundColor: "#171717", wordColor: "#e5e5e5", pivotColor: "#f87171" },
  "high-contrast": { backgroundColor: "#000000", wordColor: "#ffffff", pivotColor: "#fde047" },
  // https://catppuccin.com/palette — Latte's own "Red" accent.
  "catppuccin-latte": { backgroundColor: "#eff1f5", wordColor: "#4c4f69", pivotColor: "#d20f39" },
  // Catppuccin Mocha's own "Red" accent.
  "catppuccin-mocha": { backgroundColor: "#1e1e2e", wordColor: "#cdd6f4", pivotColor: "#f38ba8" },
  // https://www.nordtheme.com/docs/colors-and-palettes — nord0/nord6/nord11 (aurora red).
  nord: { backgroundColor: "#2e3440", wordColor: "#eceff4", pivotColor: "#bf616a" },
  // RSVP's original, already-liked default look — unchanged from before this
  // theme/preset split existed.
  ember: { backgroundColor: "#171717", wordColor: "#f5f5f5", pivotColor: "#f97316" },
};

// Themes dark enough to need Tailwind Typography's prose-invert variant for
// the article body (headings/links/code/blockquotes).
export const DARK_READER_THEMES = new Set<ReaderThemeName>([
  "dark",
  "high-contrast",
  "catppuccin-mocha",
  "nord",
  "ember",
]);

export const DEFAULT_READER_THEME_NAME: ReaderThemeName = "light";
export const DEFAULT_READER_FONT_SIZE = 17;

export const READER_FONT_LABELS: Record<ReaderFontName, string> = {
  sans: "System sans-serif",
  serif: "System serif",
  monospace: "System monospace",
  literata: "Literata",
  lora: "Lora",
  merriweather: "Merriweather",
  "eb-garamond": "EB Garamond",
  "source-serif-4": "Source Serif 4",
  "pt-serif": "PT Serif",
  "open-sans": "Open Sans",
  "atkinson-hyperlegible": "Atkinson Hyperlegible",
  "ibm-plex-sans": "IBM Plex Sans",
  opendyslexic: "OpenDyslexic",
};

// Groups the font picker dropdown into sections — purely a UI grouping, not
// persisted anywhere.
export const READER_FONT_GROUPS: { label: string; fonts: ReaderFontName[] }[] = [
  { label: "System", fonts: ["sans", "serif", "monospace"] },
  { label: "Serif", fonts: ["literata", "lora", "merriweather", "eb-garamond", "source-serif-4", "pt-serif"] },
  { label: "Sans-serif", fonts: ["open-sans", "ibm-plex-sans"] },
  { label: "Accessibility", fonts: ["atkinson-hyperlegible", "opendyslexic"] },
];

// System stacks for the original three, plus each curated webfont with a
// same-classification system fallback (self-hosted via @fontsource — see
// apps/web/src/lib/reader-fonts.ts — not a Google Fonts CDN fetch).
export const READER_FONT_STACKS: Record<ReaderFontName, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif',
  monospace: '"SF Mono", "Cascadia Code", Consolas, "Courier New", monospace',
  literata: '"Literata", Georgia, serif',
  lora: '"Lora", Georgia, serif',
  merriweather: '"Merriweather", Georgia, serif',
  "eb-garamond": '"EB Garamond", Georgia, serif',
  "source-serif-4": '"Source Serif 4", Georgia, serif',
  "pt-serif": '"PT Serif", Georgia, serif',
  "open-sans": '"Open Sans", -apple-system, sans-serif',
  "atkinson-hyperlegible": '"Atkinson Hyperlegible", -apple-system, sans-serif',
  "ibm-plex-sans": '"IBM Plex Sans", -apple-system, sans-serif',
  opendyslexic: '"OpenDyslexic", -apple-system, sans-serif',
};

export const DEFAULT_READER_FONT_FAMILY: ReaderFontName = "sans";

// Derived surface colors (border/hover/active overlays) for a given theme,
// exposed as CSS custom properties so every app-shell surface — not just
// the article panel — can theme consistently off one source of truth
// instead of each component re-deriving its own light/dark branches.
export function readerSurfaceVars(name: ReaderThemeName): CSSProperties {
  const style = READER_THEME_STYLES[name];
  const dark = DARK_READER_THEMES.has(name);
  return {
    "--surface-bg": style.background,
    "--surface-fg": style.color,
    "--surface-muted": style.muted,
    "--surface-border": dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
    "--surface-hover": dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
    "--surface-active": dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.07)",
  } as CSSProperties;
}

// Single source of truth for the reader theme derived from settings — used
// at the app root to set the CSS vars above, and by any component (article
// panel, audio player) that also needs the raw values for non-Tailwind use
// (e.g. an <audio> element's chrome, or the Typography plugin's
// prose/prose-invert switch).
export function useReaderTheme() {
  const { data: settings } = useSettings();
  const name = settings?.readerTheme.name ?? DEFAULT_READER_THEME_NAME;
  const fontSize = settings?.readerTheme.fontSize ?? DEFAULT_READER_FONT_SIZE;
  const fontFamily = settings?.readerTheme.fontFamily ?? DEFAULT_READER_FONT_FAMILY;
  return {
    name,
    fontSize,
    fontFamily,
    fontStack: READER_FONT_STACKS[fontFamily],
    style: READER_THEME_STYLES[name],
    isDark: DARK_READER_THEMES.has(name),
    vars: readerSurfaceVars(name),
  };
}
