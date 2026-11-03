import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { LoadingManager } from "three";
import { ModelViewer } from "../viewer/ModelViewer";
import {
  defaultDisplay,
  initialViewerState,
  type DisplaySettings,
} from "../viewer/types";
import type { ModelFile } from "../model-types";
import { errorMessage } from "../lib/format";
export function useModelViewer(onSource: (file: ModelFile) => void) {
  const viewportRef = useRef<HTMLDivElement>(null),
    engine = useRef<ModelViewer | null>(null),
    sourceHandler = useRef(onSource);
  sourceHandler.current = onSource;
  const [state, setState] = useState(initialViewerState),
    [display, setDisplay] = useState(defaultDisplay),
    [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!viewportRef.current) return;
    try {
      engine.current = new ModelViewer(viewportRef.current, setState, (file) =>
        sourceHandler.current(file),
      );
    } catch (error) {
      setState((previous) => ({ ...previous, error: errorMessage(error) }));
      toast.error(errorMessage(error));
    }
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => engine.current?.setDisplay(display), [display]);
  useEffect(() => engine.current?.setSpeed(speed), [speed]);
  const load = useCallback(
    async (file: ModelFile, manager?: LoadingManager) => {
      if (!engine.current) throw new Error("The 3D renderer is unavailable.");
      try {
        await engine.current.load(file, manager);
      } catch (error) {
        toast.error("Could not load model", {
          description: errorMessage(error),
        });
        throw error;
      }
    },
    [],
  );
  const updateDisplay = (update: Partial<DisplaySettings>) =>
    setDisplay((previous) => ({ ...previous, ...update }));
  const selectObject = useCallback(
    (id: string) => engine.current?.selectObject(id),
    [],
  );
  const clearSelection = useCallback(
    () => engine.current?.clearSelection(),
    [],
  );
  return {
    viewportRef,
    state,
    display,
    updateDisplay,
    speed,
    setSpeed,
    load,
    frame: () => engine.current?.frame(),
    selectObject,
    clearSelection,
    focusSourceNode: (index: number) => engine.current?.focusSourceNode(index),
    isolate: (id: string | null) => engine.current?.isolate(id),
    play: () => engine.current?.togglePlayback(),
    selectAnimation: (index: number) => engine.current?.selectAnimation(index),
    seek: (time: number) => engine.current?.seek(time),
    screenshot: () => {
      engine.current?.screenshot();
      toast.success("Viewport saved as PNG");
    },
  };
}
export type ViewerController = ReturnType<typeof useModelViewer>;
