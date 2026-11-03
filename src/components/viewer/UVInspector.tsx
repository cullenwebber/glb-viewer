import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { ViewerController } from "@/hooks/use-model-viewer";
export function UVInspector({
  viewer,
  open,
  onOpenChange,
}: {
  viewer: ViewerController;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [set, setSet] = useState(0),
    [background, setBackground] = useState("checker"),
    [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const snapshot = useMemo(
    () => (open ? viewer.getUV(set) : null),
    [
      open,
      set,
      viewer.state.selectedId,
      viewer.state.name,
      viewer.state.loading,
    ],
  );
  useEffect(() => {
    const node = canvas.current,
      ctx = node?.getContext("2d");
    if (!node || !ctx || !snapshot) return;
    const ratio = devicePixelRatio || 1,
      width = node.clientWidth,
      height = node.clientHeight;
    node.width = width * ratio;
    node.height = height * ratio;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#080808";
    ctx.fillRect(0, 0, width, height);
    const size = Math.min(width, height) * 0.82 * view.zoom,
      x = width / 2 - size / 2 + view.x,
      y = height / 2 - size / 2 + view.y;
    if (background === "texture" && snapshot.image) {
      try {
        ctx.drawImage(snapshot.image, x, y, size, size);
      } catch {}
    } else
      for (let row = 0; row < 16; row++)
        for (let col = 0; col < 16; col++) {
          ctx.fillStyle = (row + col) % 2 ? "#252525" : "#151515";
          ctx.fillRect(
            x + (col * size) / 16,
            y + (row * size) / 16,
            size / 16,
            size / 16,
          );
        }
    ctx.strokeStyle = "#888";
    ctx.strokeRect(x, y, size, size);
    ctx.strokeStyle = "#7ecfff";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const points = snapshot.segments;
    for (let i = 0; i < points.length; i += 4) {
      ctx.moveTo(x + points[i] * size, y + (1 - points[i + 1]) * size);
      ctx.lineTo(x + points[i + 2] * size, y + (1 - points[i + 3]) * size);
    }
    ctx.stroke();
  }, [open, set, background, view, snapshot?.name, snapshot?.segments.length]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>UV layout · {snapshot?.name}</DialogTitle>
          <DialogDescription>
            Choose a mesh and UV set to inspect. Scroll to zoom; drag to pan.
            Outline marks the 0–1 tile.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <NativeSelect
            aria-label="UV mesh"
            value={
              viewer.state.nodes.some(
                (node) => node.mesh && node.id === viewer.state.selectedId,
              )
                ? viewer.state.selectedId!
                : ""
            }
            onChange={(event) =>
              event.target.value
                ? viewer.selectObject(event.target.value)
                : viewer.clearSelection()
            }
          >
            <NativeSelectOption value="">First mesh</NativeSelectOption>
            {viewer.state.nodes
              .filter((node) => node.mesh)
              .map((node) => (
                <NativeSelectOption key={node.id} value={node.id}>
                  {node.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
          <NativeSelect
            aria-label="UV layout set"
            value={set}
            onChange={(e) => setSet(Number(e.target.value))}
          >
            {[0, 1, 2, 3].map((i) => (
              <NativeSelectOption key={i} value={i}>
                UV{i}
                {snapshot?.sets.includes(i) ? "" : " (missing)"}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="UV background"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
          >
            <NativeSelectOption value="checker">
              Checkerboard
            </NativeSelectOption>
            <NativeSelectOption value="texture" disabled={!snapshot?.image}>
              Base-color texture
            </NativeSelectOption>
          </NativeSelect>
          <Button
            variant="outline"
            onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
          >
            Fit
          </Button>
        </div>
        <canvas
          id="uv-layout"
          ref={canvas}
          className="w-full h-[450px] touch-none border border-border rounded-md"
          onWheel={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect(),
              px = e.clientX - rect.left - rect.width / 2,
              py = e.clientY - rect.top - rect.height / 2;
            setView((v) => {
              const zoom = Math.max(
                0.1,
                Math.min(30, v.zoom * Math.exp(-e.deltaY * 0.001)),
              );
              const factor = zoom / v.zoom;
              return {
                zoom,
                x: px - (px - v.x) * factor,
                y: py - (py - v.y) * factor,
              };
            });
          }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = e.clientX - drag.current.x,
              dy = e.clientY - drag.current.y;
            drag.current = { x: e.clientX, y: e.clientY };
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
        <p className="inspection-note">
          {!snapshot?.sets.includes(set)
            ? "This mesh has no coordinates for this UV set."
            : snapshot.truncated
              ? "Dense UV layout sampled to 50,000 triangles."
              : "UV edges include exported triangle boundaries. Texture background uses the first material's raster base-color image."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
