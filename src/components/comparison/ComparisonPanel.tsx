import { useEffect, useRef, useState } from "react";
import { ModelViewer } from "@/viewer/ModelViewer";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import type { HistoryRun } from "@/model-types";
import type { WorkbenchState } from "@/hooks/use-workbench";
import type { ViewerState } from "@/viewer/types";
export function ComparisonPanel({
  workbench: w,
  runs,
}: {
  workbench: WorkbenchState;
  runs?: HistoryRun[];
}) {
  const left = useRef<HTMLDivElement>(null),
    right = useRef<HTMLDivElement>(null),
    engines = useRef<ModelViewer[]>([]);
  const [state, setState] = useState<ViewerState>(),
    [error, setError] = useState(""),
    [split, setSplit] = useState(50);
  useEffect(() => {
    if ((!runs && (!w.source || !w.report)) || !left.current || !right.current)
      return;
    let active = true,
      url = "",
      sourceURL = "";
    const a = new ModelViewer(left.current, setState, () => {}),
      b = new ModelViewer(
        right.current,
        () => {},
        () => {},
      );
    engines.current = [a, b];
    void (async () => {
      const bytes = runs
        ? await window.desktop!.historyBytes(runs[1].id)
        : await window.desktop!.optimizedBytes(w.token);
      if (!active) return;
      url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
      let source = w.source!;
      if (runs) {
        const original = await window.desktop!.historyBytes(runs[0].id);
        if (!active) return;
        sourceURL = URL.createObjectURL(new Blob([new Uint8Array(original)]));
        source = {
          url: sourceURL,
          name: runs[0].name,
          size: original.byteLength,
          optimized: true,
        };
      }
      await Promise.all([
        a.load(source),
        b.load({
          url,
          name: runs?.[1].name || "Optimized",
          size: bytes.byteLength,
          optimized: true,
        }),
      ]);
      if (active) {
        a.linkComparison(b);
        a.frame();
      }
    })().catch((e) => active && setError(String(e.message || e)));
    return () => {
      active = false;
      engines.current = [];
      a.dispose();
      b.dispose();
      if (url) URL.revokeObjectURL(url);
      if (sourceURL) URL.revokeObjectURL(sourceURL);
    };
  }, [w.token, w.report, runs?.[0]?.id, runs?.[1]?.id]);
  if (!w.report && !runs)
    return (
      <div className="workspace-empty">
        Run optimization to compare the original and output.
      </div>
    );
  return (
    <div className="comparison-panel">
      <div className="flex gap-3 items-center border-b border-border p-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => engines.current[0]?.frame()}
        >
          Frame both
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => engines.current[0]?.togglePlayback()}
          disabled={!state?.clips.length}
        >
          {state?.playing ? "Pause" : "Play"}
        </Button>
        <NativeSelect
          aria-label="Comparison animation"
          className="w-36"
          disabled={!state?.clips.length}
          value={state?.clipIndex || 0}
          onChange={(e) =>
            engines.current[0]?.selectAnimation(Number(e.target.value))
          }
        >
          {state?.clips.map((clip, i) => (
            <NativeSelectOption key={i} value={i}>
              {clip.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span className="text-xs text-muted-foreground">Timeline</span>
        <Input
          className="min-w-24 flex-1"
          aria-label="Comparison timeline"
          type="range"
          min="0"
          max={state?.duration || 1}
          step="0.01"
          value={state?.time || 0}
          disabled={!state?.clips.length}
          onChange={(e) => engines.current[0]?.seek(Number(e.target.value))}
        />
        <span className="text-xs text-muted-foreground">Split</span>
        <Input
          className="w-36"
          aria-label="Comparison split"
          type="range"
          min="25"
          max="75"
          value={split}
          onChange={(e) => setSplit(Number(e.target.value))}
        />
      </div>
      {error && <p className="p-3 text-red-400">{error}</p>}
      {w.dirty && (
        <p className="report-note">
          Comparing the last completed run. Run optimization again to include
          your current settings.
        </p>
      )}
      <div className="comparison-views">
        <div style={{ width: split + "%" }}>
          <span>{runs?.[0].name || "Original"}</span>
          <div ref={left} />
        </div>
        <div style={{ width: 100 - split + "%" }}>
          <span>{runs?.[1].name || "Optimized"}</span>
          <div ref={right} />
        </div>
      </div>
      <p className="inspection-note p-3">
        Camera movement and animation time are linked. Each view uses the same
        lighting. Costs reflect the combined comparison workload.
      </p>
    </div>
  );
}
