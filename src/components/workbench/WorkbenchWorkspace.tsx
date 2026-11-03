import { AlertCircle, Download, Loader2 } from "lucide-react";
import { HistoryPanel } from "@/components/history/HistoryPanel";
import { BudgetsPanel } from "@/components/budgets/BudgetsPanel";
import { BatchPanel } from "@/components/batch/BatchPanel";
import type { ViewerController } from "@/hooks/use-model-viewer";
import { ComparisonPanel } from "@/components/comparison/ComparisonPanel";
import { ChecksPanel } from "@/components/checks/ChecksPanel";
import { PresetLibrary } from "@/components/presets/PresetLibrary";
import { ExportPanel } from "@/components/export/ExportPanel";
import { GeometrySettings } from "./GeometrySettings";
import { GeometryCompression } from "./GeometryCompression";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { TextureInspector } from "./TextureInspector";
import { ChannelPacking } from "./ChannelPacking";
import { SizeReport } from "./SizeReport";
import { bytesLabel, savings } from "@/lib/format";
import type { WorkbenchState } from "@/hooks/use-workbench";
export function WorkbenchWorkspace({
  workbench: w,
  onFocus,
  viewer,
}: {
  workbench: WorkbenchState;
  viewer: ViewerController;
  onFocus: (index: number) => void;
}) {
  if (!w.open) return null;
  const busy = w.phase !== "idle",
    hasOutput = !!w.report && !w.dirty && !busy;
  return (
    <section
      id="workbench"
      className="workbench-workspace"
      aria-label="Texture and optimization workspace"
    >
      <div className="workbench-toolbar">
        <div className="flex min-w-0 items-center gap-3">
          <h1>
            {
              {
                textures: "Textures",
                packing: "Channel packing",
                report: "Size report",
                geometry: "Geometry",
                checks: "Checks",
                compare: "Compare",
                history: "History",
                budgets: "Project budgets",
                batch: "Batch",
                presets: "Presets",
                export: "Export",
              }[w.tab]
            }
          </h1>
          <span id="wb-source" className="sr-only">
            {w.source?.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="wb-geometry"
            className="mr-1 text-xs text-muted-foreground"
          >
            Geometry
          </Label>
          <NativeSelect
            id="wb-geometry"
            value={w.geometry}
            onChange={(event) => w.changeGeometry(event.target.value)}
            disabled={busy}
            className="w-40 text-xs"
          >
            <NativeSelectOption value="none">Uncompressed</NativeSelectOption>
            <NativeSelectOption value="draco">Draco</NativeSelectOption>
            <NativeSelectOption value="meshopt">Meshopt</NativeSelectOption>
          </NativeSelect>
          <GeometryCompression
            geometry={w.geometry}
            options={w.geometryOptions}
            onChange={w.changeGeometryOptions}
            disabled={busy}
          />
        </div>
      </div>
      {w.notice && w.error && (
        <Alert
          id="wb-notice"
          variant={w.error ? "destructive" : "default"}
          className="workbench-notice"
        >
          {w.error && <AlertCircle />}
          <AlertDescription>{w.notice}</AlertDescription>
        </Alert>
      )}
      {w.tab === "compare" ? (
        <ComparisonPanel workbench={w} />
      ) : [
          "checks",
          "presets",
          "export",
          "history",
          "budgets",
          "batch",
        ].includes(w.tab) ? (
        <ScrollArea className="min-h-0 flex-1">
          <div id={"wb-" + w.tab}>
            {w.tab === "history" ? (
              <HistoryPanel workbench={w} />
            ) : w.tab === "budgets" ? (
              <BudgetsPanel viewer={viewer} workbench={w} />
            ) : w.tab === "batch" ? (
              <BatchPanel workbench={w} />
            ) : w.tab === "checks" ? (
              <ChecksPanel workbench={w} onFocus={onFocus} />
            ) : w.tab === "presets" ? (
              <PresetLibrary workbench={w} />
            ) : (
              <ExportPanel workbench={w} />
            )}
          </div>
        </ScrollArea>
      ) : w.analysis ? (
        <div
          id="wb-body"
          className={`min-h-0 flex-1 ${busy ? "pointer-events-none opacity-50" : ""}`}
        >
          {w.tab === "geometry" && (
            <div id="wb-geometry-options" className="h-full">
              <ScrollArea className="h-full">
                <GeometrySettings workbench={w} />
              </ScrollArea>
            </div>
          )}
          {w.tab === "textures" && (
            <div id="wb-textures" className="h-full">
              <TextureInspector workbench={w} />
            </div>
          )}
          {w.tab === "packing" && (
            <div id="wb-packing" className="h-full">
              <ScrollArea className="h-full">
                <ChannelPacking workbench={w} />
              </ScrollArea>
            </div>
          )}
          {w.tab === "report" && (
            <div id="wb-report" className="h-full">
              <ScrollArea className="h-full">
                <SizeReport report={w.report} source={w.source?.name} />
              </ScrollArea>
            </div>
          )}
        </div>
      ) : (
        <div id="wb-empty" className="workspace-empty">
          {busy && <Spinner className="size-5" />}
          <p>
            {!window.desktop
              ? "Open the Mac app to optimize local files."
              : busy
                ? "Reading textures…"
                : w.error
                  ? w.notice
                  : "Open a model to inspect its textures."}
          </p>
        </div>
      )}
      <footer className="workbench-footer">
        <div className="min-w-0">
          <strong id="wb-total">
            {w.report
              ? `${bytesLabel(w.report.beforeBytes)} → ${bytesLabel(w.report.afterBytes)} (${savings(w.report.beforeBytes, w.report.afterBytes)})`
              : w.analysis
                ? `${bytesLabel(w.analysis.beforeBytes)} original`
                : "No model loaded"}
          </strong>
          <small id="wb-dirty">
            {w.dirty && w.report ? (
              "Settings changed. Run again to update the result."
            ) : (
              <span id={w.error ? undefined : "wb-notice"} role="status">
                {w.notice || "Export creates a new GLB."}
              </span>
            )}
          </small>
        </div>
        <div className="flex items-center gap-2">
          {w.phase === "running" && (
            <Button
              id="wb-cancel"
              variant="destructive"
              size="sm"
              onClick={w.cancel}
            >
              Cancel
            </Button>
          )}
          <Button
            id="wb-original"
            variant="ghost"
            size="sm"
            disabled={!w.source || busy}
            onClick={w.viewOriginal}
          >
            View original
          </Button>
          <Button
            id="wb-preview"
            variant="outline"
            size="sm"
            disabled={!hasOutput}
            onClick={w.viewOptimized}
          >
            View optimized
          </Button>
          <Button
            id="wb-run"
            variant={hasOutput ? "outline" : "default"}
            size="sm"
            disabled={!w.analysis || busy}
            onClick={w.run}
          >
            {busy && <Loader2 className="animate-spin" />}
            {w.phase === "running" ? "Optimizing…" : "Run optimization"}
          </Button>
          <Button
            id="wb-export"
            variant={hasOutput ? "default" : "outline"}
            size="sm"
            disabled={!hasOutput}
            onClick={w.exportModel}
          >
            <Download />
            Export GLB…
          </Button>
        </div>
      </footer>
    </section>
  );
}
