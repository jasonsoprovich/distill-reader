interface DistillLogoProps {
  className?: string;
}

// Rocks-glass outline — the app's mark, next to the "Distill" wordmark in
// the sidebar header. A tumbler (no stem, unlike the previous wine glass)
// survives being shrunk down to a 16px browser-tab favicon far better, and
// it's the more literal fit for "Distill" besides — whiskey is distilled,
// wine is fermented. Stroked (not filled) so it reads as a mark rather than
// a swatch; uses currentColor so it themes with whatever text color the
// reader theme sets. Same glyph, hardcoded to the app's brand purple, is
// the source for public/favicon.svg (see that file's own note).
export default function DistillLogo({ className }: DistillLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 5L17 5 15.9 17.7A1.4 1.4 0 0 1 14.5 19H9.5A1.4 1.4 0 0 1 8.1 17.7Z" />
      <path d="M8.6 14.4Q12 15.2 15.4 14.4" />
    </svg>
  );
}
