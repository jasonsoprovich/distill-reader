import { useState } from "react";
import ArticleList from "@/components/ArticleList";
import ArticleReader from "@/components/ArticleReader";
import FeedSidebar from "@/components/FeedSidebar";
import type { Selection } from "@/lib/selection";

export default function Reader() {
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);

  return (
    <div className="flex h-screen bg-neutral-50 text-neutral-900">
      <FeedSidebar
        selection={selection}
        onSelect={(next) => {
          setSelection(next);
          setSelectedArticleId(null);
        }}
      />
      <ArticleList
        selection={selection}
        selectedArticleId={selectedArticleId}
        onSelectArticle={setSelectedArticleId}
      />
      <ArticleReader articleId={selectedArticleId} />
    </div>
  );
}
