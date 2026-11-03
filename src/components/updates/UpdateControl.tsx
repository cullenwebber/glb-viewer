import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { UpdateState } from "@/model-types";
export function UpdateControl({
  renderTrigger,
}: {
  renderTrigger?: (
    open: () => void,
    state: UpdateState | undefined,
  ) => React.ReactNode;
}) {
  const [state, setState] = useState<UpdateState>(),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (!window.desktop) return;
    void window.desktop.updateState().then(setState);
    const off = window.desktop.onUpdate((next) => {
      setState(next);
      if (next.status === "available" || next.status === "ready") setOpen(true);
    });
    const show = window.desktop.onShowUpdates(() => setOpen(true));
    return () => {
      off();
      show();
    };
  }, []);
  if (!window.desktop && !renderTrigger) return null;
  const act = (action: () => Promise<unknown>) =>
    void action().catch((e) => toast.error(String(e.message || e)));
  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true), state)
      ) : (
        <Button
          id="app-updates"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
        >
          Updates{state?.status === "available" ? " · available" : ""}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>App updates</DialogTitle>
            <DialogDescription>
              GLB Viewer {state?.version}. Releases are published on GitHub.
            </DialogDescription>
          </DialogHeader>
          <p role="status" id="update-status">
            {state?.status === "checking"
              ? "Checking for updates…"
              : state?.status === "unpublished"
                ? "No public release has been published yet."
                : state?.status === "current"
                  ? "You're up to date with the latest published release."
                  : state?.status === "available"
                    ? `Version ${state.availableVersion} is available.`
                    : state?.status === "downloading"
                      ? `Downloading update · ${Math.round(state.progress)}%`
                      : state?.status === "ready"
                        ? "Update downloaded. Restart when you're ready."
                        : state?.error || "Check for a new version."}
          </p>
          <p className="inspection-note">
            {state?.automatic
              ? "This signed app can download and install updates. Restarting closes the current session; finish active jobs first."
              : "This build uses manual updates. Download the latest installer, quit the app, and replace it in Applications. Saved presets and history are retained."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              id="check-updates"
              variant="outline"
              disabled={["checking", "downloading", "ready"].includes(
                state?.status || "",
              )}
              onClick={() => act(() => window.desktop!.checkUpdates())}
            >
              Check for updates
            </Button>
            {state?.status === "available" && (
              <Button
                onClick={() => act(() => window.desktop!.downloadUpdate())}
              >
                {state.automatic ? "Download update" : "View download"}
              </Button>
            )}
            {state?.status === "ready" && (
              <Button
                onClick={() => act(() => window.desktop!.installUpdate())}
              >
                Restart and install
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => act(() => window.desktop!.openReleases())}
            >
              GitHub releases
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
