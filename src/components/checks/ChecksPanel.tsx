import { CheckFixActions } from "./CheckFixActions";
import { useEffect, useState } from "react";
import { RefreshCw, Download, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CheckReport } from "@/model-types";
import type { WorkbenchState } from "@/hooks/use-workbench";
import { download, errorMessage } from "@/lib/format";
export function ChecksPanel({
  workbench: w,
  onFocus,
}: {
  workbench: WorkbenchState;
  onFocus: (index: number) => void;
}) {
  const [report, setReport] = useState<CheckReport>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [revision, setRevision] = useState(0),
    [target, setTarget] = useState("source");
  useEffect(() => {
    if (!w.source || !window.desktop) return;
    let active = true;
    setBusy(true);
    setError("");
    setReport(undefined);
    window.desktop
      .checkModel(w.token, target === "optimized")
      .then((result) => {
        if (active) setReport(result);
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [w.token, w.source, revision, target, w.report]);
  if (!w.source)
    return (
      <div className="workspace-empty">Open a GLB or glTF to validate it.</div>
    );
  return (
    <div className="utility-page">
      <div className="utility-heading">
        <div>
          <h2>Export checks</h2>
          <p>Official glTF validation and practical checks for Three.js.</p>
        </div>
        <div className="flex gap-2">
          <NativeSelect
            aria-label="Validation target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <NativeSelectOption value="source">Source model</NativeSelectOption>
            <NativeSelectOption
              value="optimized"
              disabled={!w.report || w.dirty}
            >
              Optimized model
            </NativeSelectOption>
          </NativeSelect>
          <Button
            id="checks-rerun"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw />
            Check again
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!report}
            onClick={() =>
              download(
                new TextEncoder().encode(JSON.stringify(report, null, 2)),
                "validation-report.json",
              )
            }
          >
            <Download />
            Report
          </Button>
        </div>
      </div>
      {target === "source" && report?.issues.some((issue) => issue.fix) && (
        <div className="settings-section mb-5">
          <h3>Resolve export checks</h3>
          <p>
            Queue fixes below, then run optimization. Unused attribute cleanup
            removes UV sets unused by the final materials. Single-sided
            rendering hides backfaces: keep double-sided materials for thin
            surfaces that need both sides. Fixes affect the exported copy;
            preview it before exporting.
          </p>
          <Button
            id="checks-fix-all"
            variant="outline"
            size="sm"
            disabled={!w.analysis || w.phase !== "idle"}
            onClick={() => {
              const singleSided = [...(w.optimization.singleSided || [])];
              for (const issue of report.issues) {
                const fix = issue.fix;
                if (
                  fix?.kind === "singleSided" &&
                  !singleSided.some(
                    (row) =>
                      row.key === fix.key && row.primitive === fix.primitive,
                  )
                )
                  singleSided.push({ key: fix.key, primitive: fix.primitive });
              }
              w.changeOptimization({
                singleSided,
                ...(report.issues.some(
                  (issue) => issue.fix?.kind === "cleanAttributes",
                )
                  ? { cleanAttributes: true }
                  : {}),
              });
            }}
          >
            Queue all listed fixes
          </Button>
        </div>
      )}
      {target === "optimized" && w.dirty && (
        <p className="report-note">
          Settings have changed. Run optimization again to validate the updated
          output.
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {busy && (
        <div className="workspace-empty">
          <Spinner />
          Validating source and external resources…
        </div>
      )}
      {report && (
        <>
          <div id="checks-summary" className="metric-strip">
            <div>
              <span>Errors</span>
              <strong>{report.errors}</strong>
            </div>
            <div>
              <span>Warnings</span>
              <strong>{report.warnings}</strong>
            </div>
            <div>
              <span>Information</span>
              <strong>{report.infos}</strong>
            </div>
            <div>
              <span>Required decoders</span>
              <strong className="text-sm">
                {report.decoders.join(", ") || "None"}
              </strong>
            </div>
          </div>
          <div className="my-5 flex justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              glTF Validator {report.validatorVersion}. Compatibility list
              targets Three.js {report.rendererVersion}.
            </p>
            <NativeSelect
              aria-label="Filter check severity"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <NativeSelectOption value="all">All checks</NativeSelectOption>
              <NativeSelectOption value="0">Errors</NativeSelectOption>
              <NativeSelectOption value="1">Warnings</NativeSelectOption>
              <NativeSelectOption value="2">Information</NativeSelectOption>
            </NativeSelect>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Location</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.issues
                .filter(
                  (issue) =>
                    filter === "all" ||
                    (filter === "2"
                      ? issue.severity >= 2
                      : issue.severity === Number(filter)),
                )
                .map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell
                      className={`align-top text-xs ${issue.severity === 0 ? "text-red-400" : issue.severity === 1 ? "text-amber-400" : "text-muted-foreground"}`}
                    >
                      {["Error", "Warning", "Info", "Hint"][issue.severity] ||
                        "Info"}
                    </TableCell>
                    <TableCell className="max-w-xl whitespace-normal text-xs">
                      <strong className="font-medium">
                        {issue.code.toLowerCase().replaceAll("_", " ")}
                      </strong>
                      <p className="mt-1 leading-relaxed text-muted-foreground">
                        {issue.message}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-64 break-all whitespace-normal text-[11px] text-muted-foreground">
                      {issue.pointer || "Document"}
                    </TableCell>
                    <TableCell>
                      {target === "source" && issue.fix && (
                        <CheckFixActions
                          fix={issue.fix}
                          options={w.optimization}
                          onChange={w.changeOptimization}
                          disabled={!w.analysis || w.phase !== "idle"}
                        />
                      )}
                      {target === "source" &&
                        issue.nodeIndex !== null &&
                        issue.nodeIndex >= 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onFocus(issue.nodeIndex!)}
                            aria-label="Show affected object"
                          >
                            <ArrowUpRight />
                            Show
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {!report.issues.length && (
            <div className="workspace-empty">No issues found.</div>
          )}
          {report.truncated && (
            <p className="report-note">
              The validator reached its issue limit. Download the report and
              resolve errors before rechecking.
            </p>
          )}
          <div className="settings-section">
            <h3>Blender handoff</h3>
            <p>
              Confirm scale and bounds in the model inspector. Check named
              actions, UVs, normals, and material appearance in the viewer.
              Procedural Blender shader graphs cannot be recovered from an
              exported GLB; bake source textures in Blender when the exported
              appearance differs.
            </p>
            <p>
              Extensions: {report.extensions.join(", ") || "None"}. Animation
              clips:{" "}
              {report.animations.map((clip) => clip.name).join(", ") || "None"}.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
