import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { bytesLabel } from "@/lib/format";
import type { ViewerState } from "@/viewer/types";
import { Button } from "@/components/ui/button";
export function ModelDetails({
  state,
  onInspectMaterial,
}: {
  state: ViewerState;
  onInspectMaterial?: (key: string) => void;
}) {
  return (
    <section>
      <div className="asset-heading">
        <strong id="filename" title={state.name}>
          {state.name}
        </strong>
        <span>
          {state.demo
            ? "Sample model"
            : `${state.name.split(".").pop()?.toLowerCase()} file`}
        </span>
      </div>
      <dl className="property-list">
        {(
          ["triangles", "vertices", "meshes", "materials", "textures"] as const
        ).map((id) => (
          <div key={id}>
            <dt>{id.charAt(0).toUpperCase() + id.slice(1)}</dt>
            <dd id={id}>{state[id].toLocaleString()}</dd>
          </div>
        ))}
        <div>
          <dt>Dimensions</dt>
          <dd className="text-[10px]">{state.dimensions}</dd>
        </div>
        {!state.demo && (
          <div>
            <dt>File size</dt>
            <dd>{bytesLabel(state.size)}</dd>
          </div>
        )}
        <div>
          <dt>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help border-b border-dotted border-muted-foreground/40">
                  Draw calls
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Model calls for the current view. Viewport total:{" "}
                {state.drawCalls}, including grid and selection.
              </TooltipContent>
            </Tooltip>
          </dt>
          <dd id="model-draw-calls">
            {state.modelDrawCalls}
            <span id="draw-calls" className="sr-only">
              {state.drawCalls}
            </span>
          </dd>
        </div>
      </dl>
      {state.selectedName && (
        <div id="selected-object" className="selection-summary">
          <span>Selected</span>
          <strong>{state.selectedName}</strong>
          <span>Materials ({state.selectedMaterialKeys.length})</span>
          {state.selectedMaterialKeys.map((key) => {
            const material = state.materialSlots.find(
              (slot) => slot.key === key,
            );
            return (
              <Button
                key={key}
                variant={
                  key === state.activeMaterialKey ? "secondary" : "ghost"
                }
                size="sm"
                className="w-full justify-start"
                onClick={() => onInspectMaterial?.(key)}
                aria-label={`Inspect material ${material?.name || key}`}
              >
                {material?.name || "Unnamed material"}
              </Button>
            );
          })}
          {!state.selectedMaterialKeys.length && (
            <span>No material on this object.</span>
          )}
        </div>
      )}
    </section>
  );
}
