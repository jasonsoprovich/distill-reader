import { useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";
import { POLL_INTERVAL_OPTIONS } from "@distill/shared";
import type { DiscoveredFeed } from "@distill/shared";
import { Badge } from "@/components/ui/badge";
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
import { useCreateFeed, useCreateTag, usePreviewFeed, useSettings, useTags } from "@/lib/hooks";

function selectClass() {
  return "h-9 rounded-md border border-[var(--surface-border)] bg-transparent px-3 text-sm text-[var(--surface-fg)] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
}

export default function AddFeedDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [discovered, setDiscovered] = useState<DiscoveredFeed | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [pollIntervalMinutes, setPollIntervalMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const preview = usePreviewFeed();
  const createFeed = useCreateFeed();
  const createTag = useCreateTag();
  const { data: tags = [] } = useTags();
  const { data: settings } = useSettings();

  // Re-seed the interval from the user's default each time the dialog opens
  // (settings may not have loaded yet on first mount).
  useEffect(() => {
    if (open) setPollIntervalMinutes(settings?.defaultPollIntervalMinutes ?? 30);
  }, [open, settings?.defaultPollIntervalMinutes]);

  function reset() {
    setUrl("");
    setDiscovered(null);
    setSelectedTagIds([]);
    setNewTagName("");
    setError(null);
  }

  async function handlePreview() {
    if (!url) return;
    setError(null);
    try {
      setDiscovered(await preview.mutateAsync(url));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not find a feed at that URL");
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    try {
      const created = await createTag.mutateAsync({ name: newTagName.trim() });
      setSelectedTagIds((prev) => [...prev, created.id]);
      setNewTagName("");
    } catch {
      // useCreateTag's onError already surfaces a toast; nothing more to do
      // here beyond not proceeding to select/clear the (non-existent) tag.
    }
  }

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function handleSave() {
    if (!discovered) return;
    setError(null);
    try {
      await createFeed.mutateAsync({ ...discovered, tagIds: selectedTagIds, pollIntervalMinutes });
      setOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that feed");
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
        <Button variant="ghost" size="icon" className="size-5 text-neutral-500" title="Add feed">
          <PlusIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a feed</DialogTitle>
          <DialogDescription>Paste a site or feed URL — we'll find the feed for you.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePreview()}
            />
            <Button variant="secondary" onClick={handlePreview} disabled={!url || preview.isPending}>
              {preview.isPending ? "Finding…" : "Find feed"}
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {discovered && (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{discovered.title}</span>
                <Badge variant="outline">{discovered.kind}</Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">{discovered.feedUrl}</p>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <button key={t.id} type="button" onClick={() => toggleTag(t.id)}>
                      <Badge variant={selectedTagIds.includes(t.id) ? "default" : "outline"}>{t.name}</Badge>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="New tag"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateTag}
                    disabled={!newTagName.trim() || createTag.isPending}
                  >
                    Add tag
                  </Button>
                </div>
              </div>

              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Check for new items
                <select
                  className={selectClass()}
                  value={pollIntervalMinutes}
                  onChange={(e) => setPollIntervalMinutes(Number(e.target.value))}
                >
                  {POLL_INTERVAL_OPTIONS.map((o) => (
                    <option key={o.minutes} value={o.minutes}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!discovered || createFeed.isPending}>
            {createFeed.isPending ? "Adding…" : "Add feed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
