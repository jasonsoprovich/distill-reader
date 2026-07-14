import sanitizeHtml from "sanitize-html";
import { signImageUrl } from "./image-proxy.js";

const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "blockquote",
  "pre",
  "code",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sub",
  "sup",
  "mark",
  "a",
  "img",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "target", "rel"],
  img: ["src", "alt", "title", "loading", "style"],
  th: ["colspan", "rowspan"],
  td: ["colspan", "rowspan"],
};

function resolveUrl(url: string, baseUrl: string): string | null {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Allowlist-sanitizes extracted article HTML before it is stored (PLAN
 * §10.1): strips scripts/styles/iframes/event handlers/`javascript:` and
 * `data:` URLs, hardens external links (`target=_blank rel=noopener
 * noreferrer`), and rewrites every image `src` through the signed image
 * proxy so no third-party requests fire when the reader renders the
 * article. `baseUrl` is the article's canonical URL, used to resolve
 * relative hrefs/srcs before proxying.
 */
export function sanitizeArticleHtml(html: string, baseUrl: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ? resolveUrl(attribs.href, baseUrl) : null;
        return {
          tagName: "a",
          attribs: {
            ...(href ? { href } : {}),
            target: "_blank",
            rel: "noopener noreferrer",
          },
        };
      },
      img: (tagName, attribs) => {
        const src = attribs.src ? resolveUrl(attribs.src, baseUrl) : null;
        if (!src) return { tagName: "img", attribs: {} };
        return {
          tagName: "img",
          attribs: {
            src: signImageUrl(src),
            ...(attribs.alt ? { alt: attribs.alt } : {}),
            ...(attribs.title ? { title: attribs.title } : {}),
            loading: "lazy",
            style: "max-width:100%;height:auto",
          },
        };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}
