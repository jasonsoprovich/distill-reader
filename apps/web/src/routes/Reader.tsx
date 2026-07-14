import { useState } from "react";
import ArticleList from "@/components/ArticleList";
import ArticleReader from "@/components/ArticleReader";
import FeedSidebar from "@/components/FeedSidebar";

export default function Reader() {
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);

  return (
    <div className="flex h-screen bg-neutral-50 text-neutral-900">
      <FeedSidebar
        selectedFeedId={selectedFeedId}
        onSelectFeed={(id) => {
          setSelectedFeedId(id);
          setSelectedArticleId(null);
        }}
      />
      <ArticleList
        feedId={selectedFeedId}
        selectedArticleId={selectedArticleId}
        onSelectArticle={setSelectedArticleId}
      />
      <ArticleReader articleId={selectedArticleId} />
    </div>
  );
}
