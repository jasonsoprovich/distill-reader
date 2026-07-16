import type { ReaderThemeName } from "@distill/shared";

export const READER_THEME_LABELS: Record<ReaderThemeName, string> = {
  light: "Light",
  sepia: "Sepia",
  dark: "Dark",
  "high-contrast": "High contrast",
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
};

// Themes dark enough to need Tailwind Typography's prose-invert variant for
// the article body (headings/links/code/blockquotes).
export const DARK_READER_THEMES = new Set<ReaderThemeName>(["dark", "high-contrast"]);

export const DEFAULT_READER_THEME_NAME: ReaderThemeName = "light";
export const DEFAULT_READER_FONT_SIZE = 17;
