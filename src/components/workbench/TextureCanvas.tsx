import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
export function TextureCanvas({
  decoded,
  channel,
  flip,
  loading,
  error,
}: {
  decoded?: HTMLCanvasElement;
  channel: string;
  flip: boolean;
  loading: boolean;
  error: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    stageRef = useRef<HTMLDivElement>(null),
    drag = useRef<{
      id: number;
      x: number;
      y: number;
      panX: number;
      panY: number;
    } | null>(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 }),
    [stage, setStage] = useState({ width: 1, height: 1 }),
    [dragging, setDragging] = useState(false),
    [pixel, setPixel] = useState("Move over the image to inspect its pixels.");
  const reset = () => setView({ zoom: 1, x: 0, y: 0 });
  useEffect(() => {
    reset();
  }, [decoded]);
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setStage({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect(),
        point = {
          x: event.clientX - rect.left - rect.width / 2,
          y: event.clientY - rect.top - rect.height / 2,
        };
      setView((previous) => {
        const zoom = Math.max(
            0.125,
            Math.min(32, previous.zoom * Math.exp(-event.deltaY * 0.003)),
          ),
          ratio = zoom / previous.zoom;
        return {
          zoom,
          x: point.x - (point.x - previous.x) * ratio,
          y: point.y - (point.y - previous.y) * ratio,
        };
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", wheel);
    };
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded) return;
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(decoded, 0, 0);
    if (channel === "RGBA") return;
    const image = context.getImageData(0, 0, canvas.width, canvas.height),
      index = ["R", "G", "B", "A"].indexOf(channel);
    for (let i = 0; i < image.data.length; i += 4) {
      if (index >= 0)
        image.data[i] =
          image.data[i + 1] =
          image.data[i + 2] =
            image.data[i + index];
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [decoded, channel]);
  const fit = decoded
    ? Math.min(stage.width / decoded.width, stage.height / decoded.height) *
      0.94
    : 1;
  function zoomTo(zoom: number) {
    setView((previous) => {
      zoom = Math.max(0.125, Math.min(32, zoom));
      const ratio = zoom / previous.zoom;
      return { zoom, x: previous.x * ratio, y: previous.y * ratio };
    });
  }
  return (
    <div className="texture-canvas">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] text-muted-foreground">
          Scroll to zoom · Drag to pan
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom texture out"
            onClick={() => zoomTo(view.zoom / 1.5)}
          >
            <ZoomOut />
          </Button>
          <Input
            id="wb-zoom"
            aria-label="Texture zoom percent"
            type="number"
            min={12.5}
            max={3200}
            step={25}
            value={Math.round(view.zoom * 100)}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value > 0) zoomTo(value / 100);
            }}
            className="h-7 w-19 text-right text-xs"
          />
          <span className="text-xs text-muted-foreground">%</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom texture in"
            onClick={() => zoomTo(view.zoom * 1.5)}
          >
            <ZoomIn />
          </Button>
          <Button id="wb-fit" variant="outline" size="sm" onClick={reset}>
            <Scan />
            Fit
          </Button>
        </div>
      </div>
      <div
        id="wb-image-stage"
        ref={stageRef}
        className="texture-stage texture-checker"
        data-zoom={view.zoom}
        data-pan-x={view.x}
        data-pan-y={view.y}
        style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
        onDoubleClick={reset}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            panX: view.x,
            panY: view.y,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (current?.id === event.pointerId)
            setView((previous) => ({
              ...previous,
              x: current.panX + event.clientX - current.x,
              y: current.panY + event.clientY - current.y,
            }));
        }}
        onPointerUp={(event) => {
          if (drag.current?.id === event.pointerId) {
            drag.current = null;
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragging(false);
        }}
      >
        <canvas
          id="wb-image"
          ref={canvasRef}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: decoded ? decoded.width * fit : 0,
            height: decoded ? decoded.height * fit : 0,
            maxWidth: "none",
            maxHeight: "none",
            transform: `translate(-50%,-50%) translate(${view.x}px,${view.y}px) scale(${view.zoom}) scaleY(${flip ? -1 : 1})`,
          }}
          onMouseMove={(event) => {
            if (!decoded || !canvasRef.current || drag.current) return;
            const canvas = canvasRef.current,
              rect = canvas.getBoundingClientRect(),
              x = Math.min(
                canvas.width - 1,
                Math.max(
                  0,
                  Math.floor(
                    ((event.clientX - rect.left) / rect.width) * canvas.width,
                  ),
                ),
              );
            let y = Math.min(
              canvas.height - 1,
              Math.max(
                0,
                Math.floor(
                  ((event.clientY - rect.top) / rect.height) * canvas.height,
                ),
              ),
            );
            if (flip) y = canvas.height - 1 - y;
            const rgba = decoded
              .getContext("2d")!
              .getImageData(x, y, 1, 1).data;
            setPixel(
              `Preview (${x}, ${y}) · R ${rgba[0]}  G ${rgba[1]}  B ${rgba[2]}  A ${rgba[3]} · raw encoded values`,
            );
          }}
        />
        {loading && (
          <div id="wb-image-loading" className="texture-image-overlay">
            <Spinner />
            Decoding image…
          </div>
        )}
        {error && (
          <Alert variant="destructive" className="absolute inset-x-5 w-auto">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <p id="wb-pixel" className="min-h-4 text-[10px] text-muted-foreground">
        {pixel}
      </p>
    </div>
  );
}
