import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { bytesLabel, errorMessage } from "@/lib/format";
import type { ProjectBudget } from "@/model-types";
import type { ViewerController } from "@/hooks/use-model-viewer";
import type { WorkbenchState } from "@/hooks/use-workbench";
const fields = [
  { key: "fileBytes", label: "Model size (MB)", scale: 1e6 },
  { key: "textureBytes", label: "Texture memory (MB)", scale: 1e6 },
  { key: "triangles", label: "Triangles", scale: 1 },
  { key: "drawCalls", label: "Draw calls", scale: 1 },
] as const;
export function BudgetsPanel({
  viewer: v,
  workbench: w,
}: {
  viewer: ViewerController;
  workbench: WorkbenchState;
}) {
  const [rows, setRows] = useState<ProjectBudget[]>([]),
    [budget, setBudget] = useState<Partial<ProjectBudget>>({
      name: "Web project",
      fileBytes: 5e6,
      textureBytes: 64e6,
      triangles: 100000,
      drawCalls: 50,
    });
  const refresh = () =>
    void window.desktop
      ?.listBudgets()
      .then(setRows)
      .catch((e) => w.notify(errorMessage(e), true));
  useEffect(() => {
    refresh();
  }, []);
  const metrics = {
    fileBytes:
      !v.state.optimized && v.state.name === w.source?.name && w.analysis
        ? w.analysis.beforeBytes
        : v.state.size,
    textureBytes: v.state.textureBytes,
    triangles: v.state.triangles,
    drawCalls: v.state.modelDrawCalls,
  };
  return (
    <div className="utility-page">
      <div className="utility-heading">
        <div>
          <h2>Project budgets</h2>
          <p>
            Save limits for each destination project. Batch jobs can use the
            same budget to flag expensive outputs.
          </p>
        </div>
        <NativeSelect
          aria-label="Saved budget"
          value={budget.id || ""}
          onChange={(e) =>
            setBudget(
              rows.find((row) => row.id === e.target.value) || {
                name: "New project",
              },
            )
          }
        >
          <NativeSelectOption value="">New budget</NativeSelectOption>
          {rows.map((row) => (
            <NativeSelectOption key={row.id} value={row.id}>
              {row.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="max-w-2xl space-y-5">
        <Label htmlFor="budget-name">Project name</Label>
        <Input
          id="budget-name"
          value={budget.name || ""}
          onChange={(e) => setBudget((b) => ({ ...b, name: e.target.value }))}
        />
        {fields.map((field) => (
          <div className="control-property" key={field.key}>
            <Label htmlFor={"budget-" + field.key}>{field.label}</Label>
            <Input
              className="w-40"
              id={"budget-" + field.key}
              type="number"
              min="0"
              step={field.scale === 1 ? 1 : 0.1}
              value={(budget[field.key] || 0) / field.scale}
              onChange={(e) =>
                setBudget((b) => ({
                  ...b,
                  [field.key]: Math.max(
                    0,
                    Math.round(Number(e.target.value) * field.scale),
                  ),
                }))
              }
            />
          </div>
        ))}
        <p className="inspection-note">
          Zero disables a limit. Memory is an estimate. Live draw calls depend
          on the current camera and rendering settings.
        </p>
        <div className="flex gap-2">
          <Button
            id="save-budget"
            onClick={() =>
              void window
                .desktop!.saveBudget(budget)
                .then((saved) => {
                  setBudget(saved);
                  refresh();
                  w.notify("Project budget saved.");
                })
                .catch((e) => w.notify(errorMessage(e), true))
            }
          >
            Save budget
          </Button>
          {budget.id && (
            <Button
              variant="outline"
              onClick={() =>
                void window
                  .desktop!.deleteBudget(budget.id!)
                  .then(() => {
                    setBudget({ name: "New project" });
                    refresh();
                  })
                  .catch((e) => w.notify(errorMessage(e), true))
              }
            >
              Delete budget
            </Button>
          )}
        </div>
      </div>
      <section className="settings-section mt-8">
        <h3>Viewport asset · {v.state.name}</h3>
        <div className="metric-strip">
          {fields.map((field) => {
            const actual = metrics[field.key],
              limit = budget[field.key] || 0;
            return (
              <div key={field.key}>
                <span>{field.label.split(" (")[0]}</span>
                <strong
                  className={limit && actual > limit ? "text-red-400" : ""}
                >
                  {field.scale === 1
                    ? actual.toLocaleString()
                    : bytesLabel(actual)}
                </strong>
                <small>
                  {limit
                    ? `${actual > limit ? "Over" : "Within"} limit · ${field.scale === 1 ? limit.toLocaleString() : bytesLabel(limit)}`
                    : "No limit"}
                </small>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
