import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useAddArticleFromUrl } from "@/lib/hooks";

// Typed-in URLs very often omit the scheme — mirrors AddFeedDialog's own
// normalizeUrl (mobile keyboards especially tend to drop "https://" that a
// copy-pasted link would already have).
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Saves a single page as a read-it-later article (PLAN item 5) — distinct
// from AddFeedDialog, which subscribes to an ongoing feed. No tags/poll
// interval here: there's no feed for either to attach to, just one article.
// Trigger mirrors AddFeedDialog's own small "+" icon button — this lives
// next to FeedSidebar's "Saved articles" row the same way AddFeedDialog's
// lives next to the "Feeds" header.
export default function AddArticleDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addArticle = useAddArticleFromUrl();

  function reset() {
    setUrl("");
    setError(null);
  }

  async function handleSave() {
    if (!url.trim()) return;
    setError(null);
    try {
      await addArticle.mutateAsync({ url: normalizeUrl(url) });
      setOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that article");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-5 text-neutral-500" title="Save article from URL">
          <PlusIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save an article</DialogTitle>
          <DialogDescription>
            Paste a link to a single page — we'll pull the article text so it shows up in your Unread list, without
            adding a feed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            placeholder="https://example.com/some-article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!url.trim() || addArticle.isPending}>
            {addArticle.isPending ? "Saving…" : "Save article"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
