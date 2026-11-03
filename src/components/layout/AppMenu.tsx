import { MoreHorizontal, Keyboard, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { UpdateControl } from "@/components/updates/UpdateControl";
import { toast } from "sonner";
export function AppMenu({ onHelp }: { onHelp: () => void }) {
  return (
    <UpdateControl
      renderTrigger={(showUpdates, state) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              id="app-menu"
              variant="ghost"
              size="icon-sm"
              aria-label="App menu"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              id="app-updates"
              disabled={!window.desktop}
              onSelect={showUpdates}
            >
              <Download />
              App updates
              {["available", "ready"].includes(state?.status || "") && (
                <span className="ml-auto size-1.5 rounded-full bg-blue-400" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onHelp}>
              <Keyboard />
              Keyboard shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!window.desktop}
              onSelect={() =>
                void window.desktop
                  ?.openReleases()
                  .catch((error) => toast.error(error.message))
              }
            >
              <ExternalLink />
              GitHub releases
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              GLB Viewer{state?.version ? ` ${state.version}` : ""}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    />
  );
}
