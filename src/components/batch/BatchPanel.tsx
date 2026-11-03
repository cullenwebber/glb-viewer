import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { bytesLabel } from "@/lib/format";
import type { WorkbenchState } from "@/hooks/use-workbench";
export function BatchPanel({ workbench: w }: { workbench: WorkbenchState }) {
  const {
    presets,
    budgets,
    preset,
    setPreset,
    budget,
    setBudget,
    folder,
    rows,
    busy,
    output,
    refresh,
    choose,
    run,
  } = w.batch;
  useEffect(refresh, []);
  return (
    <div className="utility-page">
      <div className="utility-heading">
        <div>
          <h2>Batch processing</h2>
          <p>
            Process a model folder with a saved preset. Each output is validated
            and written to a new folder; source files stay intact.
          </p>
        </div>
        <Button
          id="batch-choose"
          variant="outline"
          disabled={busy}
          onClick={choose}
        >
          Choose folder…
        </Button>
      </div>
      <div className="flex gap-3 mb-5">
        <NativeSelect
          aria-label="Batch preset"
          disabled={busy}
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          <NativeSelectOption value="">Choose preset</NativeSelectOption>
          {presets.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Batch budget"
          disabled={busy}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        >
          <NativeSelectOption value="">No project budget</NativeSelectOption>
          {budgets.map((b) => (
            <NativeSelectOption key={b.id} value={b.id}>
              {b.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          id="batch-run"
          disabled={busy || !folder?.names.length || !preset}
          onClick={run}
        >
          Run batch…
        </Button>
        {busy && (
          <Button
            variant="destructive"
            onClick={() => void window.desktop!.cancelBatch()}
          >
            Cancel batch
          </Button>
        )}
      </div>
      <p className="inspection-note">
        Jobs run sequentially. Missing or ambiguous preset inputs are reported.
        Invalid assets fail individually while the queue continues. Folder
        selection includes nested models; symlinks are skipped. Budget draw
        calls are primitive estimates and texture memory uses RGBA8 mip
        estimates.
      </p>
      {output && (
        <p role="status" className="report-note">
          Output: {output}. Includes per-model reports and batch-report.json.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.index} data-batch-row={row.index}>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell>
                {row.beforeBytes === undefined
                  ? "—"
                  : bytesLabel(row.beforeBytes)}
              </TableCell>
              <TableCell>
                {row.afterBytes === undefined
                  ? "—"
                  : bytesLabel(row.afterBytes)}
              </TableCell>
              <TableCell className="whitespace-normal max-w-lg">
                {row.message}
                {row.warnings?.join(" ")}
                {row.budgets
                  ?.filter((b) => b.exceeded)
                  .map((b) => `${b.key} over budget`)
                  .join(", ")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!folder && (
        <div className="workspace-empty">
          Save a preset, then choose a folder of GLB or glTF models.
        </div>
      )}
    </div>
  );
}
