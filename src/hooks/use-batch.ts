import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/format";
import type { BatchRow, Preset, ProjectBudget } from "@/model-types";
export function useBatch(notify: (message: string, error?: boolean) => void) {
  const [presets, setPresets] = useState<Preset[]>([]),
    [budgets, setBudgets] = useState<ProjectBudget[]>([]),
    [preset, setPreset] = useState(""),
    [budget, setBudget] = useState(""),
    [folder, setFolder] = useState<{ id: string; names: string[] } | null>(
      null,
    ),
    [rows, setRows] = useState<BatchRow[]>([]),
    [busy, setBusy] = useState(false),
    [output, setOutput] = useState("");
  const refresh = () => {
    if (window.desktop)
      void Promise.all([
        window.desktop.listPresets(),
        window.desktop.listBudgets(),
      ])
        .then(([p, b]) => {
          setPresets(p);
          setBudgets(b);
          setPreset((current) =>
            p.some((row) => row.id === current) ? current : p[0]?.id || "",
          );
        })
        .catch((e) => notify(errorMessage(e), true));
  };
  useEffect(
    () =>
      window.desktop?.onBatchProgress((row) =>
        setRows((previous) =>
          previous.map((item) => (item.index === row.index ? row : item)),
        ),
      ),
    [],
  );
  async function choose() {
    try {
      const selected = await window.desktop!.chooseBatch();
      if (selected) {
        setFolder(selected);
        setRows(
          selected.names.map((name, index) => ({
            index,
            name,
            status: "queued",
          })),
        );
        setOutput("");
      }
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  async function run() {
    if (!folder) return;
    setBusy(true);
    setRows(
      folder.names.map((name, index) => ({ index, name, status: "queued" })),
    );
    try {
      const result = await window.desktop!.runBatch(folder.id, preset, budget);
      if (result) {
        setOutput(result.output);
        if (result.rows) setRows(result.rows);
        else if (result.cancelled)
          setRows((previous) =>
            previous.map((row) =>
              ["running", "queued"].includes(row.status)
                ? { ...row, status: "cancelled" }
                : row,
            ),
          );
      }
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }
  return {
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
  };
}
