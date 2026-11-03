import { Eye, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { bytesLabel } from "@/lib/format";
import type { ViewerController } from "@/hooks/use-model-viewer";
export function PerformancePanel({ viewer: v }: { viewer: ViewerController }) {
  const { state, display } = v;
  return (
    <aside className="performance-panel">
      <div className="panel-heading">
        <h2>Performance</h2>
        <span>Live view</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="inspector-sections">
          <section>
            <div className="performance-metrics">
              <div>
                <span>Frame interval</span>
                <strong id="perf-frame-ms">
                  {state.frameMs.toFixed(1)} ms
                </strong>
              </div>
              <div>
                <span>Frame rate</span>
                <strong>{state.fps} fps</strong>
              </div>
            </div>
            <dl className="property-list mt-5">
              <div>
                <dt>Model draw calls</dt>
                <dd>{state.modelDrawCalls}</dd>
              </div>
              <div>
                <dt>CPU render submission</dt>
                <dd>{state.renderMs.toFixed(2)} ms</dd>
              </div>
              <div>
                <dt>Geometry memory estimate</dt>
                <dd>{bytesLabel(state.geometryBytes)}</dd>
              </div>
              <div>
                <dt>Texture memory estimate</dt>
                <dd>{bytesLabel(state.textureBytes)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
              Measurements use this Mac, the current camera and pixel ratio. CPU
              submission time is not GPU execution time. Raster texture memory
              assumes RGBA8; compressed textures use their loaded mip payloads.
            </p>
          </section>
          <section>
            <h3 className="section-heading">Load timings</h3>
            <dl className="property-list">
              {[
                ["Source read", state.timings?.readMs],
                ["Parse and external resources", state.timings?.decodeMs],
                ["Shader compilation", state.timings?.compileMs],
                ["First render submission", state.timings?.firstRenderMs],
              ].map(([name, value]) => (
                <div key={String(name)}>
                  <dt>{name}</dt>
                  <dd>
                    {typeof value === "number" ? value.toFixed(1) + " ms" : "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h3 className="section-heading">Viewport experiments</h3>
            {(
              [
                { key: "shadows", label: "Shadows" },
                { key: "transparency", label: "Transparency" },
                { key: "transmission", label: "Transmission" },
              ] as const
            ).map(({ key, label }) => (
              <div className="control-property" key={key}>
                <Label htmlFor={"perf-" + key}>{label}</Label>
                <Switch
                  id={"perf-" + key}
                  checked={display[key]}
                  onCheckedChange={(value) => v.updateDisplay({ [key]: value })}
                />
              </div>
            ))}
            <div className="control-property">
              <Label htmlFor="perf-pixel-ratio">Pixel ratio cap</Label>
              <NativeSelect
                id="perf-pixel-ratio"
                value={display.pixelRatio}
                onChange={(event) =>
                  v.updateDisplay({ pixelRatio: Number(event.target.value) })
                }
                className="w-24"
              >
                {[0.5, 1, 1.5, 2].map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value}×
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Preview only. Shadows require directional lighting. Exported
              materials are unchanged.
            </p>
          </section>
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="section-heading mb-0">Meshes by draw calls</h3>
              {state.isolatedId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => v.isolate(null)}
                >
                  Show all
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {[...state.meshMetrics]
                .sort(
                  (a, b) =>
                    b.drawCalls - a.drawCalls || b.triangles - a.triangles,
                )
                .map((mesh) => (
                  <div key={mesh.id} className="performance-mesh">
                    <div>
                      <strong title={mesh.name}>{mesh.name}</strong>
                      <span>
                        {mesh.drawCalls} calls ·{" "}
                        {mesh.triangles.toLocaleString()} triangles
                      </span>
                      <small>
                        {mesh.materials.join(", ")}
                        {mesh.transparent ? " · transparent" : ""}
                        {mesh.transmission ? " · transmission" : ""}
                      </small>
                    </div>
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Frame ${mesh.name}`}
                        onClick={() => v.selectObject(mesh.id)}
                      >
                        <Scan />
                      </Button>
                      <Button
                        variant={
                          state.isolatedId === mesh.id ? "secondary" : "ghost"
                        }
                        size="icon-sm"
                        aria-label={`Isolate ${mesh.name}`}
                        onClick={() =>
                          v.isolate(
                            state.isolatedId === mesh.id ? null : mesh.id,
                          )
                        }
                      >
                        <Eye />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}
