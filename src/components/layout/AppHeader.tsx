import { Box, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppMenu } from "./AppMenu";
import { WorkspaceSections } from "./WorkspaceSections";
import type { WorkspaceNavigator } from "@/hooks/use-workspace-navigation";
export function AppHeader({
  name,
  demo,
  onOpen,
  onHelp,
  navigation,
}: {
  name: string;
  demo: boolean;
  onOpen: () => void;
  onHelp: () => void;
  navigation: WorkspaceNavigator;
}) {
  return (
    <header className="app-titlebar">
      <div className="app-identity">
        <Box className="size-4 shrink-0" aria-label="GLB Viewer" />
        <span className="header-divider" aria-hidden="true">
          /
        </span>
        <span
          id="title-file"
          className="header-filename"
          title={demo ? "No model open" : name}
        >
          {demo ? "Untitled" : name}
        </span>
      </div>
      <WorkspaceSections navigation={navigation} />
      <div className="header-actions">
        <Button id="open-model" variant="outline" size="sm" onClick={onOpen}>
          <FolderOpen />
          Open model
        </Button>
        <AppMenu onHelp={onHelp} />
      </div>
    </header>
  );
}
