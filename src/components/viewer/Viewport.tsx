import { Camera, Scan, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { inspectionModes } from "./MaterialControls";
import { PlaybackBar } from "./PlaybackBar";
import type { ViewerController } from "@/hooks/use-model-viewer";
export function Viewport({
  viewer,
  dragging,
  onOpen,
}: {
  viewer: ViewerController;
  dragging: boolean;
  onOpen: () => void;
}) {
  const { state, display } = viewer;
  return (
    <main className="viewer-main">
      <div id="viewport" ref={viewer.viewportRef} className="model-viewport">
        <div className="viewport-toolbar">
          <div className="viewport-mode">
            <span>Perspective</span>
            <span className="mode-divider" />
            <span id="view-mode">
              {display.inspection !== "material"
                ? inspectionModes[display.inspection]
                : display.wireframe
                  ? "Wireframe"
                  : "Material"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  id="reset"
                  variant="ghost"
                  size="sm"
                  onClick={viewer.frame}
                >
                  <Scan />
                  Frame
                </Button>
              </TooltipTrigger>
              <TooltipContent>Frame selection (F)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  id="screenshot"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Save viewport PNG"
                  onClick={viewer.screenshot}
                >
                  <Camera />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save viewport as PNG</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {state.loading && (
          <div id="loading" className="viewport-overlay">
            <Spinner className="size-5" />
            Loading model…
          </div>
        )}
        {dragging && (
          <div id="drop-overlay" className="drop-overlay">
            <PackageOpen className="size-8" />
            <h2>Drop a model to open it</h2>
            <p>GLB or glTF with its textures and buffers</p>
          </div>
        )}
        <div className="viewport-axis">
          <span className="text-green-300/60">Y</span>
          <div>
            <span className="text-blue-300/60">Z</span>
            <span className="text-red-300/60">X</span>
          </div>
        </div>
        <div className="viewport-hint">
          <span>Orbit</span> Drag <span>Zoom</span> Scroll <span>Pan</span>{" "}
          Right-drag
        </div>
        {state.demo && (
          <div className="sample-note">
            <span>Sample model</span>
            <Button id="sample-note" variant="link" size="sm" onClick={onOpen}>
              Open your own file
            </Button>
          </div>
        )}
      </div>
      {state.clips.length > 0 && <PlaybackBar viewer={viewer} />}
      <div className="viewer-status">
        <span id="status">
          {state.error
            ? "Could not load model"
            : state.loading
              ? "Loading model…"
              : state.demo
                ? "Drop a model to start"
                : "Model loaded"}
        </span>
        <span>{state.fps} fps</span>
      </div>
    </main>
  );
}
