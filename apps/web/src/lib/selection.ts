import type { ArticleView } from "@distill/shared";

// The left-nav sections (All / smart views / tags / feeds) are mutually
// exclusive — picking one clears the others, mirroring typical reader UX.
export type Selection =
  | { kind: "all" }
  | { kind: "view"; view: ArticleView }
  | { kind: "feed"; id: string }
  | { kind: "tag"; id: string };

export function selectionToArticlesParams(selection: Selection): {
  feedId?: string;
  tagId?: string;
  view?: ArticleView;
} {
  switch (selection.kind) {
    case "feed":
      return { feedId: selection.id };
    case "tag":
      return { tagId: selection.id };
    case "view":
      return { view: selection.view };
    default:
      return {};
  }
}
