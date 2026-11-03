const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  updateState: () => ipcRenderer.invoke("update-state"),
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  openReleases: () => ipcRenderer.invoke("open-releases"),
  onUpdate: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("update-state", listener);
    return () => ipcRenderer.removeListener("update-state", listener);
  },
  onShowUpdates: (callback) => {
    ipcRenderer.on("show-updates", callback);
    return () => ipcRenderer.removeListener("show-updates", callback);
  },
  listHistory: (key) => ipcRenderer.invoke("list-history", key),
  saveHistory: (token, recipe) =>
    ipcRenderer.invoke("save-history", token, recipe),
  renameHistory: (id, name) => ipcRenderer.invoke("rename-history", id, name),
  deleteHistory: (id) => ipcRenderer.invoke("delete-history", id),
  historyBytes: (id) => ipcRenderer.invoke("history-bytes", id),
  restoreHistory: (token, id) =>
    ipcRenderer.invoke("restore-history", token, id),
  listBudgets: () => ipcRenderer.invoke("list-budgets"),
  saveBudget: (value) => ipcRenderer.invoke("save-budget", value),
  deleteBudget: (id) => ipcRenderer.invoke("delete-budget", id),
  chooseBatch: () => ipcRenderer.invoke("choose-batch"),
  runBatch: (id, preset, budget) =>
    ipcRenderer.invoke("run-batch", id, preset, budget),
  cancelBatch: () => ipcRenderer.invoke("cancel-batch"),
  onBatchProgress: (callback) => {
    const listener = (_event, row) => callback(row);
    ipcRenderer.on("batch-progress", listener);
    return () => ipcRenderer.removeListener("batch-progress", listener);
  },
  checkModel: (token, output) =>
    ipcRenderer.invoke("checks-model", token, output),
  watchModel: (token, enabled) =>
    ipcRenderer.invoke("watch-model", token, enabled),
  watchState: () => ipcRenderer.invoke("watch-state"),
  onWatchError: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("watch-error", listener);
    return () => ipcRenderer.removeListener("watch-error", listener);
  },
  listPresets: () => ipcRenderer.invoke("list-presets"),
  savePreset: (preset) => ipcRenderer.invoke("save-preset", preset),
  deletePreset: (id) => ipcRenderer.invoke("delete-preset", id),
  importPreset: () => ipcRenderer.invoke("import-preset"),
  exportPreset: (preset) => ipcRenderer.invoke("export-preset", preset),
  getRecipe: (key) => ipcRenderer.invoke("get-recipe", key),
  saveRecipe: (key, recipe) => ipcRenderer.invoke("save-recipe", key, recipe),
  exportBundle: (token) => ipcRenderer.invoke("export-bundle", token),
  importTextures: (token) => ipcRenderer.invoke("import-textures", token),
  analyzeModel: (token) => ipcRenderer.invoke("analyze-model", token),
  optimizeModel: (token, plan) =>
    ipcRenderer.invoke("optimize-model", token, plan),
  cancelOptimization: (token) =>
    ipcRenderer.invoke("cancel-optimization", token),
  textureImage: (token, id, output) =>
    ipcRenderer.invoke("texture-image", token, id, output),
  optimizedBytes: (token) => ipcRenderer.invoke("optimized-bytes", token),
  exportOptimized: (token) => ipcRenderer.invoke("export-optimized", token),
  onOptimizerProgress: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("optimizer-progress", listener);
    return () => ipcRenderer.removeListener("optimizer-progress", listener);
  },
  chooseModel: () => ipcRenderer.invoke("choose-model"),
  openFile: (file) =>
    ipcRenderer.invoke("open-path", webUtils.getPathForFile(file)),
  onOpen: (callback) => {
    const listener = (_event, model) => callback(model);
    ipcRenderer.on("open-model", listener);
    ipcRenderer.send("renderer-ready");
    return () => ipcRenderer.removeListener("open-model", listener);
  },
});
