import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { WorkbenchState } from "@/hooks/use-workbench";
import { errorMessage } from "@/lib/format";
export function WatchControl({ workbench: w }: { workbench: WorkbenchState }) {
  const [watching, setWatching] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    window.desktop?.watchState().then((state) => {
      if (active) setWatching(state.enabled);
    });
    return () => {
      active = false;
    };
  }, [w.token]);
  useEffect(
    () =>
      window.desktop?.onWatchError((message) =>
        toast.error("File watching", { description: message }),
      ),
    [],
  );
  async function toggle() {
    if (!w.source) return;
    setBusy(true);
    try {
      const recipe = w.getRecipe();
      if (recipe && w.source.sourceKey)
        await window.desktop!.saveRecipe(w.source.sourceKey, recipe);
      const state = await window.desktop!.watchModel(w.token, !watching);
      setWatching(state.enabled);
      toast.success(
        state.enabled ? "Watching Blender exports" : "File watching paused",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          id="watch-model"
          variant={watching ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={watching}
          aria-label="Watch Blender exports"
          disabled={!w.source || busy || !window.desktop}
          onClick={toggle}
        >
          <RefreshCw className={watching ? "text-blue-400" : ""} />
          {watching ? "Watching" : "Watch"}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Reload this model and its referenced resources after a Blender export.
        Camera and recipe are retained.
      </TooltipContent>
    </Tooltip>
  );
}
