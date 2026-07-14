import { useArticle } from "@/lib/hooks";

interface ArticleReaderProps {
  articleId: string | null;
}

export default function ArticleReader({ articleId }: ArticleReaderProps) {
  const { data: article, isLoading } = useArticle(articleId);

  if (!articleId) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 text-sm text-neutral-400">Select an article to read it here.</div>
      </main>
    );
  }

  if (isLoading || !article) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 text-sm text-neutral-400">Loading…</div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <article className="mx-auto max-w-[66ch] px-6 py-8">
        <h1 className="text-2xl font-semibold text-neutral-900">{article.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <span>{article.feedTitle}</span>
          {article.author && <span>· {article.author}</span>}
          {article.publishedAt && <span>· {new Date(article.publishedAt).toLocaleDateString()}</span>}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs underline underline-offset-2"
          >
            Open original
          </a>
        </div>

        {article.extractionStatus !== "ok" && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {article.extractionStatus === "failed"
              ? "We couldn't extract this article cleanly — open the original to read it."
              : "This extraction may be incomplete — open the original if something looks missing."}
          </p>
        )}

        <div
          className="prose prose-neutral mt-6 max-w-none leading-relaxed"
          // content_html is sanitized server-side on ingest (PLAN §10.1)
          // before it is ever stored.
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />
      </article>
    </main>
  );
}
