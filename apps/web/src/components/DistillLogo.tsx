interface DistillLogoProps {
  className?: string;
}

// Wine glass silhouette — the app's mark, next to the "Distill" wordmark in
// the sidebar header. Filled (not stroked, unlike lucide-react's Wine icon)
// so it reads as a logo mark rather than another line-art UI icon; uses
// currentColor so it themes with whatever text color the reader theme sets
// rather than a hardcoded fill. Same glyph, hardcoded to the app's brand
// purple, is the source for public/favicon.svg (see that file's own note).
export default function DistillLogo({ className }: DistillLogoProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M7 2C5.5 6 5.8 10.5 9 13.2 10 14.05 11 14.6 12 15 13 14.6 14 14.05 15 13.2 18.2 10.5 18.5 6 17 2Z" />
      <path d="M11.3 15h1.4v5.3h-1.4z" />
      <path d="M8.5 20.3h7c0 1-1.5 1.6-3.5 1.6s-3.5-.6-3.5-1.6z" />
    </svg>
  );
}
