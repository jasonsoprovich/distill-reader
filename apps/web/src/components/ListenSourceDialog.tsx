import { FileTextIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { UseTtsPlayback } from "@/lib/use-tts-playback";

interface ListenSourceDialogProps {
  playback: UseTtsPlayback;
}

// Asked every time Listen is clicked, rather than remembered — full article
// and summary are different lengths/cache entries, and which one makes
// sense can change per article (e.g. no summary generated yet).
export default function ListenSourceDialog({ playback }: ListenSourceDialogProps) {
  const { isModalOpen, closeModal, chooseSource, hasSummary, fullCharCount, summaryCharCount, isGenerating } =
    playback;

  return (
    <Dialog open={isModalOpen} onOpenChange={(next) => !next && closeModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Read aloud</DialogTitle>
          <DialogDescription>Narrate the AI summary or the full article?</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-3"
            disabled={!hasSummary || isGenerating}
            onClick={() => chooseSource("summary")}
          >
            <SparklesIcon className="size-4 shrink-0" />
            <span className="flex flex-col items-start">
              <span>AI summary</span>
              <span className="text-xs text-muted-foreground">
                {hasSummary ? `${summaryCharCount.toLocaleString()} characters` : "Generate a summary first"}
              </span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-3"
            disabled={isGenerating}
            onClick={() => chooseSource("full")}
          >
            <FileTextIcon className="size-4 shrink-0" />
            <span className="flex flex-col items-start">
              <span>Full article</span>
              <span className="text-xs text-muted-foreground">{fullCharCount.toLocaleString()} characters</span>
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
