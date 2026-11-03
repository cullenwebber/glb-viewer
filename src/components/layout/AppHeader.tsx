import { Box, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
export function AppHeader({
  name,
  demo,
  onOpen,
  onOptimize,
  watch,
}: {
  name: string;
  demo: boolean;
  onOpen: () => void;
  onOptimize: () => void;
  watch?: React.ReactNode;
}) {
  return (
    <header className="app-titlebar">
      <div className="app-identity">
        <Box className="size-4" />
        <span>GLB Viewer</span>
        <span className="header-divider">/</span>
        <span id="title-file" className="header-filename">
          {demo ? "Untitled" : name}
        </span>
      </div>
      <div className="header-actions">
        {watch}
        <Button variant="outline" size="sm" onClick={onOpen}>
          <FolderOpen />
          Open model<Kbd className="ml-2">⌘ O</Kbd>
        </Button>
        <Button size="sm" onClick={onOptimize}>
          Optimize
        </Button>
      </div>
    </header>
  );
}
