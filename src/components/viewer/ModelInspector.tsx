import { ScrollArea } from "@/components/ui/scroll-area";
import { ModelDetails } from "./ModelDetails";
import { DisplayControls } from "./DisplayControls";
import { LightingControls } from "./LightingControls";
import { ThreeJsSnippet } from "./ThreeJsSnippet";
import type { ViewerController } from "@/hooks/use-model-viewer";
export function ModelInspector({ viewer }: { viewer: ViewerController }) {
  return (
    <aside className="model-inspector">
      <div className="panel-heading">
        <h2>Inspector</h2>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="inspector-sections">
          <ModelDetails state={viewer.state} />
          <DisplayControls
            display={viewer.display}
            onChange={viewer.updateDisplay}
          />
          <LightingControls
            display={viewer.display}
            onChange={viewer.updateDisplay}
          />
          <ThreeJsSnippet
            filename={viewer.state.demo ? "model.glb" : viewer.state.name}
          />
        </div>
      </ScrollArea>
    </aside>
  );
}
