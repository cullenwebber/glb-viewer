const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  Menu,
  shell,
  nativeImage,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { randomUUID, createHash } = require("node:crypto");
const { createLibrary } = require("./pipeline/library.cjs");
const { ModelWatcher } = require("./pipeline/file-watcher.cjs");
const { exportBundle } = require("./pipeline/export-bundle.cjs");
// Preserve existing preferences when applying the user-facing app name.
const existingUserData = app.getPath("userData");
app.setName("GLB Viewer");
app.setPath("userData", existingUserData);
process.title = "GLB Viewer";
if (process.env.GLB_VIEWER_USER_DATA) {
  require("node:fs").mkdirSync(process.env.GLB_VIEWER_USER_DATA, {
    recursive: true,
  });
  app.setPath("userData", path.resolve(process.env.GLB_VIEWER_USER_DATA));
}
const { Worker } = require("node:worker_threads");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "viewer",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: "model",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
let window;
let rendererReady = false;
let pending = process.argv.find((arg) => /\.(glb|gltf)$/i.test(arg));
const roots = new Map();
const modelPaths = new Map();
const importedBySource = new Map();
let optimizerSession;
let library;
let history, budgets, batch, updates;
const batches = new Map();
const { createHistory } = require("./pipeline/history.cjs");
const { createBudgets } = require("./pipeline/budgets.cjs");
const watcher = new ModelWatcher(
  async (file) => {
    if (optimizerSession?.busy) {
      setTimeout(
        () =>
          watcher.enabled && watcher.file === file && watcher.onChange(file),
        800,
      );
      return;
    }
    const model = await grant(file, true);
    window.webContents.send("open-model", model);
  },
  (message) => window?.webContents.send("watch-error", message),
);
function stopOptimizer() {
  if (!optimizerSession) return;
  for (const request of optimizerSession.requests.values())
    request.reject(new Error("Model changed."));
  optimizerSession.worker.terminate();
  optimizerSession = null;
}
function workerRequest(session, method, args) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    session.requests.set(id, { resolve, reject });
    session.worker.postMessage({ id, method, args });
  });
}
function activeSession(token) {
  if (!optimizerSession || optimizerSession.token !== token)
    throw new Error("Model changed. Reopen the optimizer.");
  return optimizerSession;
}
async function grant(file, reloaded = false) {
  const resolved = await fs.realpath(file);
  if (!/\.(glb|gltf)$/i.test(resolved))
    throw new Error("Choose a GLB or glTF file.");
  if (watcher.enabled && watcher.file !== resolved) watcher.stop();
  const token = randomUUID();
  roots.clear();
  modelPaths.clear();
  stopOptimizer();
  modelPaths.set(token, resolved);
  roots.set(token, path.dirname(resolved));
  const stat = await fs.stat(resolved);
  return {
    url: `model://${token}/${encodeURIComponent(path.basename(resolved))}`,
    name: path.basename(resolved),
    size: stat.size,
    sourceKey: createHash("sha256").update(resolved).digest("hex").slice(0, 32),
    reloaded,
  };
}
async function deliver(file) {
  try {
    window.webContents.send("open-model", await grant(file));
  } catch (error) {
    dialog.showErrorBox("Unable to open model", error.message);
  }
}
async function choose() {
  const result = await dialog.showOpenDialog(window, {
    properties: ["openFile"],
    filters: [{ name: "glTF models", extensions: ["glb", "gltf"] }],
  });
  return result.canceled ? null : grant(result.filePaths[0]);
}
app.on("open-file", (event, file) => {
  event.preventDefault();
  if (window?.webContents && rendererReady && !window.webContents.isLoading())
    deliver(file);
  else pending = file;
});
app.whenReady().then(() => {
  const iconPath = path.join(__dirname, "../assets/icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === "darwin" && !icon.isEmpty()) app.dock?.setIcon(icon);
  app.setAboutPanelOptions({
    applicationName: "GLB Viewer",
    applicationVersion: app.getVersion(),
    version: "",
    copyright: "© " + new Date().getFullYear() + " Cullen Webber",
    credits: "A local workspace for glTF and Three.js.",
    iconPath,
  });
  const { autoUpdater } = require("electron-updater");
  updates = require("./pipeline/updates.cjs").createUpdates({
    app,
    autoUpdater,
    shell,
    fetch: net.fetch,
    send: (state) => window?.webContents.send("update-state", state),
  });
  ipcMain.handle("update-state", () => updates.state());
  ipcMain.handle("check-updates", () => updates.check());
  ipcMain.handle("download-update", () => updates.download());
  ipcMain.handle("install-update", () => {
    if (optimizerSession?.busy || batch)
      throw new Error(
        "Finish or cancel active jobs before installing an update.",
      );
    return updates.install();
  });
  ipcMain.handle("open-releases", () => updates.openReleases());
  library = createLibrary(app.getPath("userData"));
  history = createHistory(app.getPath("userData"));
  budgets = createBudgets(app.getPath("userData"));
  ipcMain.handle("list-history", (_event, key) => history.list(key));
  ipcMain.handle("save-history", async (_event, token, recipe) => {
    const session = activeSession(token);
    if (!session.hasOutput || session.busy)
      throw new Error("Finish optimization first.");
    const file = modelPaths.get(token),
      key = createHash("sha256").update(file).digest("hex").slice(0, 32);
    return history.save(
      key,
      "Run " + new Date().toLocaleString(),
      recipe,
      await workerRequest(session, "bundle"),
    );
  });
  ipcMain.handle("rename-history", (_event, id, name) =>
    history.rename(id, name),
  );
  ipcMain.handle("delete-history", (_event, id) => history.delete(id));
  ipcMain.handle("history-bytes", (_event, id) => history.bytes(id));
  ipcMain.handle("restore-history", async (_event, token, id) => {
    const session = activeSession(token);
    if (session.busy) throw new Error("Wait for optimization to finish.");
    const data = await history.get(id),
      key = createHash("sha256")
        .update(modelPaths.get(token))
        .digest("hex")
        .slice(0, 32);
    if (data.sourceKey !== key)
      throw new Error("Open the source model for this run first.");
    await workerRequest(session, "restore", data);
    session.hasOutput = true;
    return { report: data.report, recipe: data.recipe };
  });
  ipcMain.handle("list-budgets", () => budgets.list());
  ipcMain.handle("save-budget", (_event, value) => budgets.save(value));
  ipcMain.handle("delete-budget", (_event, id) => budgets.delete(id));
  ipcMain.handle("choose-batch", async () => {
    const selected = await dialog.showOpenDialog(window, {
      properties: ["openDirectory"],
      title: "Choose models folder",
    });
    if (selected.canceled) return null;
    const { discoverModels } = await import("./pipeline/batch.mjs"),
      jobs = await discoverModels(selected.filePaths[0]),
      id = randomUUID();
    batches.set(id, jobs);
    return { id, names: jobs.map((job) => job.relative) };
  });
  ipcMain.handle("run-batch", async (_event, id, presetId, budgetId) => {
    if (batch) throw new Error("A batch is already running.");
    const jobs = batches.get(id);
    if (!jobs?.length) throw new Error("Choose a folder with models first.");
    const preset = (await library.list()).find((p) => p.id === presetId);
    if (!preset) throw new Error("Choose a saved preset.");
    const selected = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose output folder",
    });
    if (selected.canceled) return null;
    const output = path.join(
      selected.filePaths[0],
      "glb-batch-" + randomUUID().slice(0, 8),
    );
    await fs.mkdir(output);
    const budget = (await budgets.list()).find((b) => b.id === budgetId);
    const worker = new Worker(path.join(__dirname, "batch-worker.mjs"), {
      workerData: { jobs, output, recipe: preset.recipe, budget },
    });
    return new Promise((resolve, reject) => {
      batch = { worker, output, resolve };
      worker.on("message", (message) => {
        if (message.row)
          window?.webContents.send("batch-progress", message.row);
        else {
          batch = null;
          worker.terminate();
          message.error
            ? reject(new Error(message.error))
            : resolve(message.result);
        }
      });
      worker.on("error", (error) => {
        batch = null;
        reject(error);
      });
    });
  });
  ipcMain.handle("cancel-batch", async () => {
    if (!batch) return;
    const current = batch;
    batch = null;
    await current.worker.terminate();
    async function cleanup(folder) {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) await cleanup(file);
        else if (entry.name.endsWith(".partial"))
          await fs.rm(file, { force: true });
      }
    }
    await cleanup(current.output);
    let report = { rows: [] };
    try {
      report = JSON.parse(
        await fs.readFile(
          path.join(current.output, "batch-report.json"),
          "utf8",
        ),
      );
    } catch {}
    await fs.writeFile(
      path.join(current.output, "batch-report.json"),
      JSON.stringify({ ...report, cancelled: true }, null, 2),
    );
    current.resolve({ cancelled: true, output: current.output });
  });
  protocol.handle("viewer", async (request) => {
    try {
      const url = new URL(request.url),
        root = path.join(__dirname, "../dist");
      if (url.hostname !== "app")
        return new Response("Forbidden", { status: 403 });
      const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
      const relative = path.relative(root, file);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        return new Response("Forbidden", { status: 403 });
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      if (/^decoders\/(basis|draco)-worker\.js$/.test(relative))
        headers.set(
          "Content-Security-Policy",
          "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
        );
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  protocol.handle("model", async (request) => {
    try {
      const url = new URL(request.url);
      const root = roots.get(url.hostname);
      if (!root) return new Response("Expired model access", { status: 403 });
      const file = await fs.realpath(
        path.resolve(root, "." + decodeURIComponent(url.pathname)),
      );
      const relative = path.relative(root, file);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        return new Response("Outside model directory", { status: 403 });
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response("Missing local model resource", { status: 404 });
    }
  });
  async function analyzeModel(token) {
    if (optimizerSession?.token === token) return optimizerSession.analysis;
    const file = modelPaths.get(token);
    if (!file) throw new Error("Open a local model first.");
    stopOptimizer();
    const worker = new Worker(path.join(__dirname, "optimizer-worker.mjs"));
    const session = {
      token,
      worker,
      requests: new Map(),
      busy: false,
      analysis: null,
    };
    optimizerSession = session;
    worker.on("message", (message) => {
      if (message.progress) {
        window.webContents.send("optimizer-progress", {
          token,
          message: message.progress,
        });
        return;
      }
      const request = session.requests.get(message.id);
      if (!request) return;
      session.requests.delete(message.id);
      message.error
        ? request.reject(new Error(message.error))
        : request.resolve(message.result);
    });
    worker.on("error", (error) => {
      for (const request of session.requests.values()) request.reject(error);
      session.requests.clear();
      if (optimizerSession === session) optimizerSession = null;
    });
    session.analysis = workerRequest(session, "analyze", file).then(
      async (analysis) => {
        const inputs = importedBySource.get(file) || [];
        if (inputs.length) {
          try {
            return await workerRequest(session, "importImages", inputs);
          } catch {
            window.webContents.send(
              "watch-error",
              "Some packing input files could not be reimported. Reimport them before running the recipe.",
            );
          }
        }
        return analysis;
      },
    );
    session.analysis
      .then((analysis) => {
        if (watcher.enabled && watcher.file === file)
          void watcher.setTargets(analysis.resources || [file]);
      })
      .catch(() => {});
    return session.analysis;
  }
  ipcMain.handle("analyze-model", (_event, token) => analyzeModel(token));

  ipcMain.handle("import-textures", async (_event, token) => {
    const session = activeSession(token);
    if (session.busy) throw new Error("Wait for optimization to finish.");
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Texture images",
          extensions: ["png", "jpg", "jpeg", "webp", "avif"],
        },
      ],
    });
    if (result.canceled) return null;
    const analysis = await workerRequest(
      session,
      "importImages",
      result.filePaths,
    );
    importedBySource.set(modelPaths.get(token), [
      ...new Set([
        ...(importedBySource.get(modelPaths.get(token)) || []),
        ...result.filePaths,
      ]),
    ]);
    session.analysis = Promise.resolve(analysis);
    return analysis;
  });
  ipcMain.handle("optimize-model", async (_event, token, plan) => {
    const session = activeSession(token);
    if (session.busy) throw new Error("An optimization is already running.");
    session.busy = true;
    try {
      const result = await workerRequest(session, "optimize", plan);
      session.hasOutput = true;
      return result;
    } finally {
      session.busy = false;
    }
  });
  ipcMain.handle("cancel-optimization", (_event, token) => {
    activeSession(token);
    stopOptimizer();
  });
  ipcMain.handle("texture-image", (_event, token, id, output) =>
    workerRequest(activeSession(token), "texture", { id, output }),
  );
  ipcMain.handle("optimized-bytes", (_event, token) => {
    const session = activeSession(token);
    if (!session.hasOutput) throw new Error("Run optimization first.");
    return workerRequest(session, "output");
  });
  ipcMain.handle("export-optimized", async (_event, token) => {
    const session = activeSession(token);
    if (!session.hasOutput) throw new Error("Run optimization first.");
    const original = modelPaths.get(token);
    const selected = await dialog.showSaveDialog(window, {
      defaultPath: original.replace(/\.(glb|gltf)$/i, "-optimized.glb"),
      filters: [{ name: "Binary glTF", extensions: ["glb"] }],
    });
    if (selected.canceled) return null;
    const destination = selected.filePath.endsWith(".glb")
      ? selected.filePath
      : selected.filePath + ".glb";
    let existing;
    try {
      existing = await fs.realpath(destination);
    } catch {}
    if (existing === original || path.resolve(destination) === original)
      throw new Error("Choose a new filename to keep the original intact.");
    const bytes = await workerRequest(session, "output");
    await fs.writeFile(destination, bytes);
    return destination;
  });
  ipcMain.handle("checks-model", async (_event, token, output = false) => {
    const file = modelPaths.get(token);
    if (!file) throw new Error("Open a model first.");
    if (!optimizerSession || optimizerSession.token !== token)
      await analyzeModel(token).catch(() => {});
    return workerRequest(activeSession(token), "checks", { file, output });
  });
  ipcMain.handle("watch-model", async (_event, token, enabled) => {
    const file = modelPaths.get(token);
    if (!file) throw new Error("Open a model first.");
    if (!enabled) {
      watcher.stop();
      return watcher.state();
    }
    const state = await watcher.start(file);
    try {
      const analysis = await activeSession(token).analysis;
      await watcher.setTargets(analysis.resources || [file]);
    } catch {}
    return state;
  });
  ipcMain.handle("watch-state", () => watcher.state());
  ipcMain.handle("list-presets", () => library.list());
  ipcMain.handle("save-preset", (_event, preset) => library.save(preset));
  ipcMain.handle("delete-preset", (_event, id) => library.delete(id));
  ipcMain.handle("get-recipe", (_event, key) => library.getRecipe(key));
  ipcMain.handle("save-recipe", (_event, key, recipe) =>
    library.saveRecipe(key, recipe),
  );
  ipcMain.handle("export-preset", async (_event, preset) => {
    const selected = await dialog.showSaveDialog(window, {
      defaultPath: "optimization-preset.json",
      filters: [{ name: "Optimization preset", extensions: ["json"] }],
    });
    if (selected.canceled) return null;
    const presets = await library.list(),
      saved = presets.find((item) => item.id === preset.id);
    if (!saved) throw new Error("Preset no longer exists.");
    await fs.writeFile(selected.filePath, JSON.stringify(saved, null, 2));
    return selected.filePath;
  });
  ipcMain.handle("import-preset", async () => {
    const selected = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "Optimization preset", extensions: ["json"] }],
    });
    if (selected.canceled) return null;
    const file = selected.filePaths[0];
    if ((await fs.stat(file)).size > 1024 * 1024)
      throw new Error("Preset file is too large.");
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    return library.save({ name: data.name, recipe: data.recipe });
  });
  ipcMain.handle("export-bundle", async (_event, token) => {
    const session = activeSession(token);
    if (!session.hasOutput || session.busy)
      throw new Error("Finish optimization before exporting.");
    const selected = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose a folder for the Three.js bundle",
    });
    if (selected.canceled) return null;
    const data = await workerRequest(session, "bundle");
    return exportBundle(
      selected.filePaths[0],
      path.basename(modelPaths.get(token)),
      data,
      path.join(__dirname, "../dist/decoders"),
    );
  });
  ipcMain.handle("choose-model", choose);
  ipcMain.handle("open-path", (_event, file) => grant(file));
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    title: "GLB Viewer",
    backgroundColor: "#000000",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 23 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  const dev = process.argv.includes("--dev");
  if (dev) window.loadURL("http://127.0.0.1:5173");
  else window.loadURL("viewer://app/index.html");
  ipcMain.on("renderer-ready", () => {
    rendererReady = true;
    if (app.isPackaged && !process.argv.includes("--dev")) {
      const timer = setTimeout(() => void updates.check(), 15000);
      timer.unref();
    }
    if (pending) {
      const file = pending;
      pending = null;
      void deliver(file);
    }
  });
  window.webContents.on("did-start-loading", () => {
    rendererReady = false;
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          {
            label: "Check for updates…",
            click: async () => {
              await updates.check();
              window.webContents.send("show-updates");
            },
          },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "File",
        submenu: [
          {
            label: "Open Model…",
            accelerator: "CmdOrCtrl+O",
            click: async () => {
              const model = await choose();
              if (model) window.webContents.send("open-model", model);
            },
          },
          { role: "close" },
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
  app.on("activate", () => window.show());
});
app.on("window-all-closed", () => {
  watcher.stop();
  stopOptimizer();
  batch?.worker.terminate();
  app.quit();
});
