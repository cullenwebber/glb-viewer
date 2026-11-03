import { useBatch } from "./use-batch";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Analysis,
  ModelFile,
  Pack,
  Report,
  TextureSetting,
  GeometryCompression,
  OptimizationOptions,
  Plan,
  Recipe,
} from "../model-types";
import { errorMessage } from "../lib/format";
import { createRecipe, applyRecipe } from "../lib/recipes";
export function useWorkbench(preview: (file: ModelFile) => Promise<void>) {
  const [open, setOpen] = useState(false),
    [source, setSource] = useState<ModelFile>(),
    [analysis, setAnalysis] = useState<Analysis>(),
    [report, setReport] = useState<Report>();
  const [settings, setSettings] = useState<TextureSetting[]>([]),
    [packs, setPacks] = useState<Pack[]>([]),
    [geometry, setGeometry] = useState("none"),
    [geometryOptions, setGeometryOptions] = useState<GeometryCompression>({}),
    [optimization, setOptimization] = useState<OptimizationOptions>({
      preserveNamed: true,
    }),
    [selected, setSelected] = useState(0),
    [tab, setTab] = useState("textures");
  const [phase, setPhase] = useState<"idle" | "analyzing" | "running">("idle"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(false),
    [dirty, setDirty] = useState(false);
  const runId = useRef(0),
    loadedToken = useRef(""),
    recipeRef = useRef<Recipe | null>(null),
    token = source ? new URL(source.url).hostname : "";
  const notify = useCallback((message: string, isError = false) => {
    setNotice(message);
    setError(isError);
  }, []);
  const batch = useBatch(notify);
  const setPlan = useCallback((plan: Plan) => {
    setGeometry(plan.geometry);
    setGeometryOptions(plan.geometryOptions || {});
    setOptimization(plan.optimization || { preserveNamed: true });
    setSettings(plan.textures);
    setPacks(plan.packs);
  }, []);
  const accept = useCallback((next: Analysis, reset = true) => {
    setAnalysis(next);
    setSettings((previous) =>
      next.textures.map(
        (row) =>
          (!reset && previous.find((setting) => setting.id === row.id)) || {
            id: row.id,
            maxSize: 0,
            format: "keep",
          },
      ),
    );
    if (reset) {
      setSelected(next.textures[0]?.id ?? 0);
      setPacks([]);
      setReport(undefined);
      setDirty(false);
    }
  }, []);
  useEffect(() => {
    if (!source || !window.desktop) return;
    const version = ++runId.current,
      remembered = source.reloaded ? recipeRef.current : null;
    loadedToken.current = "";
    setPhase("analyzing");
    setAnalysis(undefined);
    setReport(undefined);
    setNotice("");
    setError(false);
    (async () => {
      const next = await window.desktop!.analyzeModel(token);
      const saved =
        remembered ||
        (source.sourceKey
          ? await window.desktop!.getRecipe(source.sourceKey)
          : null);
      if (version !== runId.current) return;
      accept(next);
      setGeometry("none");
      setGeometryOptions({});
      setOptimization({ preserveNamed: true });
      loadedToken.current = token;
      if (saved) {
        const { plan, warnings } = applyRecipe(next, saved);
        setPlan(plan);
        setDirty(true);
        notify(
          warnings.length
            ? "Recipe restored. " + warnings.join(" ")
            : source.reloaded
              ? "Blender export reloaded. Camera and recipe retained."
              : "Saved model recipe restored.",
        );
      }
    })()
      .catch((error) => {
        if (version === runId.current) notify(errorMessage(error), true);
      })
      .finally(() => {
        if (version === runId.current) setPhase("idle");
      });
    return () => {
      runId.current++;
    };
  }, [source, token, accept, setPlan, notify]);
  useEffect(
    () =>
      window.desktop?.onOptimizerProgress((event) => {
        if (event.token === token) setNotice(event.message);
      }),
    [token],
  );
  const plan: Plan = {
    geometry,
    geometryOptions,
    optimization,
    textures: settings,
    packs,
  };
  if (analysis && loadedToken.current === token) {
    recipeRef.current = createRecipe(analysis, plan);
  }
  useEffect(() => {
    if (
      !analysis ||
      !source?.sourceKey ||
      phase !== "idle" ||
      loadedToken.current !== token
    )
      return;
    const recipe = createRecipe(analysis, {
      geometry,
      geometryOptions,
      optimization,
      textures: settings,
      packs,
    });
    const timer = setTimeout(() => {
      void window
        .desktop!.saveRecipe(source.sourceKey!, recipe)
        .catch((error) =>
          notify(
            "Could not save the model recipe: " + errorMessage(error),
            true,
          ),
        );
    }, 400);
    return () => clearTimeout(timer);
  }, [
    analysis,
    source,
    token,
    phase,
    geometry,
    geometryOptions,
    optimization,
    settings,
    packs,
    notify,
  ]);
  const sourceLoaded = useCallback((file: ModelFile) => {
    if (!file.optimized)
      setSource((previous) => (previous?.url === file.url ? previous : file));
  }, []);
  const changeTexture = (id: number, update: Partial<TextureSetting>) => {
    setSettings((previous) =>
      previous.map((setting) =>
        setting.id === id ? { ...setting, ...update } : setting,
      ),
    );
    setDirty(true);
  };
  const changePacks = (next: Pack[]) => {
    setPacks(next);
    setDirty(true);
  };
  const changeGeometry = (next: string) => {
    setGeometry(next);
    setDirty(true);
  };
  const changeGeometryOptions = (update: Partial<GeometryCompression>) => {
    setGeometryOptions((previous) => ({ ...previous, ...update }));
    setDirty(true);
  };
  const changeOptimization = (update: Partial<OptimizationOptions>) => {
    setOptimization((previous) => ({ ...previous, ...update }));
    setDirty(true);
  };
  function applyPreset(recipe: Recipe) {
    if (!analysis) {
      notify("Open a model before applying a preset.", true);
      return;
    }
    const { plan, warnings } = applyRecipe(analysis, recipe);
    setPlan(plan);
    setDirty(true);
    notify(
      warnings.length
        ? "Preset applied. " + warnings.join(" ")
        : "Preset applied. Run optimization to preview it.",
    );
  }
  async function importTextures() {
    try {
      const next = await window.desktop!.importTextures(token);
      if (!next) return;
      accept(next, false);
      setSelected(next.textures.at(-1)?.id ?? 0);
      setDirty(true);
      notify(
        "Imported images are packing inputs. A recipe binds the packed result to your model.",
      );
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }
  async function run() {
    if (!analysis || phase !== "idle") return;
    const version = ++runId.current;
    setPhase("running");
    notify("Starting optimization…");
    try {
      const next = await window.desktop!.optimizeModel(token, plan);
      if (version !== runId.current) return;
      setReport(next);
      setDirty(false);
      setTab("report");
      try {
        await window.desktop!.saveHistory(token, createRecipe(analysis, plan));
      } catch (error) {
        next.warnings = [
          ...(next.warnings || []),
          "History could not be saved: " + errorMessage(error),
        ];
      }
      notify(
        next.warnings?.length
          ? "Optimization complete. " + next.warnings.join(" ")
          : "Optimization complete. Compare the model and textures before exporting.",
      );
    } catch (error) {
      if (version === runId.current) {
        setDirty(true);
        notify(errorMessage(error), true);
      }
    } finally {
      if (version === runId.current) setPhase("idle");
    }
  }
  async function cancel() {
    const version = ++runId.current;
    try {
      await window.desktop!.cancelOptimization(token);
      setPhase("analyzing");
      const next = await window.desktop!.analyzeModel(token);
      if (version !== runId.current) return;
      accept(next);
      loadedToken.current = token;
      notify("Optimization cancelled. Settings have been reset to the source.");
    } catch (error) {
      if (version === runId.current) notify(errorMessage(error), true);
    } finally {
      if (version === runId.current) setPhase("idle");
    }
  }
  async function viewOriginal() {
    if (!source) return;
    try {
      await preview(source);
      setOpen(false);
      setTab("model");
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }
  async function viewOptimized() {
    let url: string | undefined;
    try {
      const bytes = await window.desktop!.optimizedBytes(token);
      url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
      await preview({
        url,
        name: source!.name.replace(/\.(glb|gltf)$/i, "-optimized.glb"),
        size: bytes.byteLength,
        optimized: true,
      });
      setOpen(false);
      setTab("model");
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
  async function restoreRun(id: string) {
    if (!analysis || phase !== "idle") return;
    setPhase("running");
    try {
      const saved = await window.desktop!.restoreHistory(token, id);
      const matched = applyRecipe(analysis, saved.recipe);
      setPlan(matched.plan);
      setReport(saved.report);
      setDirty(false);
      notify(
        "Run restored. Output is the saved snapshot; a new optimization uses the current source.",
      );
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      setPhase("idle");
    }
  }
  async function exportModel() {
    try {
      const file = await window.desktop!.exportOptimized(token);
      if (file) notify("Exported " + file);
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }
  async function exportBundle() {
    try {
      const directory = await window.desktop!.exportBundle(token);
      if (directory) notify("Exported Three.js bundle to " + directory);
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }
  return {
    batch,
    open,
    setOpen,
    source,
    sourceLoaded,
    token,
    analysis,
    report,
    settings,
    packs,
    geometry,
    geometryOptions,
    optimization,
    plan,
    selected,
    setSelected,
    tab,
    setTab,
    phase,
    notice,
    error,
    dirty,
    changeTexture,
    changePacks,
    changeGeometry,
    changeGeometryOptions,
    changeOptimization,
    applyPreset,
    getRecipe: () => (analysis ? createRecipe(analysis, plan) : null),
    importTextures,
    run,
    cancel,
    viewOriginal,
    viewOptimized,
    restoreRun,
    exportModel,
    exportBundle,
    notify,
  };
}
export type WorkbenchState = ReturnType<typeof useWorkbench>;
