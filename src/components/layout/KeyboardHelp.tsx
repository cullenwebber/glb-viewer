import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
export function KeyboardHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make yourself at home.</DialogTitle>
          <DialogDescription>
            Navigate your model and inspect assets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-3 text-sm">
          {[
            ["⌘ O", "Open a model"],
            ["F", "Frame the model"],
            ["Space", "Play / pause animation"],
          ].map(([key, action]) => (
            <div key={key} className="flex items-center gap-4">
              <Kbd>{key}</Kbd>
              <span>{action}</span>
            </div>
          ))}
          <p className="text-xs leading-relaxed text-muted-foreground">
            For a glTF file, keep its textures and buffers beside it. In the
            browser, drop the whole model folder.
          </p>
        </div>
        <Button onClick={() => onOpenChange(false)}>Got it</Button>
      </DialogContent>
    </Dialog>
  );
}
