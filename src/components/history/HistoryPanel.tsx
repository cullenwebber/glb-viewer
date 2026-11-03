import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { ComparisonPanel } from "@/components/comparison/ComparisonPanel";
import { bytesLabel, errorMessage } from "@/lib/format";
import type { HistoryRun } from "@/model-types";
import type { WorkbenchState } from "@/hooks/use-workbench";
export function HistoryPanel({ workbench: w }: { workbench: WorkbenchState }) {
  const [runs, setRuns] = useState<HistoryRun[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [compare, setCompare] = useState(false),
    [deleting, setDeleting] = useState("");
  const refresh = () => {
    if (w.source?.sourceKey)
      void window
        .desktop!.listHistory(w.source.sourceKey)
        .then(setRuns)
        .catch((e) => w.notify(errorMessage(e), true));
  };
  useEffect(refresh, [w.source?.sourceKey, w.report]);
  if (compare && selected.length === 2)
    return (
      <div className="h-[65vh] flex flex-col">
        <Button variant="ghost" onClick={() => setCompare(false)}>
          Back to history
        </Button>
        <ComparisonPanel
          workbench={w}
          runs={selected.map((id) => runs.find((run) => run.id === id)!)}
        />
      </div>
    );
  return (
    <div className="utility-page">
      <div className="utility-heading">
        <div>
          <h2>Optimization history</h2>
          <p>
            Every completed run saves its output, settings, and size report
            locally. Compare two runs or restore a snapshot.
          </p>
        </div>
        <Button
          disabled={selected.length !== 2}
          onClick={() => setCompare(true)}
        >
          Compare selected
        </Button>
      </div>
      <p className="inspection-note">
        History uses disk space until you delete a run. Restoring never replaces
        the source file.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead>Run name</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Output size</TableHead>
            <TableHead>Codec</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id} data-history={run.id}>
              <TableCell>
                <Checkbox
                  aria-label={`Compare ${run.name}`}
                  checked={selected.includes(run.id)}
                  onCheckedChange={(checked) =>
                    setSelected((previous) =>
                      checked
                        ? [...previous.slice(-1), run.id]
                        : previous.filter((id) => id !== run.id),
                    )
                  }
                />
              </TableCell>
              <TableCell>
                <Input
                  aria-label={`Run name ${run.id}`}
                  defaultValue={run.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== run.name)
                      void window
                        .desktop!.renameHistory(run.id, e.target.value)
                        .then(refresh)
                        .catch((err) => w.notify(errorMessage(err), true));
                  }}
                />
              </TableCell>
              <TableCell>{new Date(run.createdAt).toLocaleString()}</TableCell>
              <TableCell>{bytesLabel(run.report.afterBytes)}</TableCell>
              <TableCell>{run.report.geometry}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={w.phase !== "idle"}
                    onClick={() => w.restoreRun(run.id)}
                  >
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(run.id)}
                  >
                    Delete
                  </Button>
                </div>
                {deleting === run.id && (
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        void window
                          .desktop!.deleteHistory(run.id)
                          .then(() => {
                            setDeleting("");
                            setSelected((s) => s.filter((id) => id !== run.id));
                            refresh();
                          })
                          .catch((e) => w.notify(errorMessage(e), true))
                      }
                    >
                      Delete saved output
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleting("")}
                    >
                      Keep
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!runs.length && (
        <div className="workspace-empty">
          Open a model and run optimization to save its first snapshot.
        </div>
      )}
    </div>
  );
}
