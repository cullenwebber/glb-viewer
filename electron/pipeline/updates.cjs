const { spawnSync } = require("node:child_process");
const RELEASES = "https://github.com/cullenwebber/glb-viewer/releases";
function newer(remote, current) {
  const parse = (value) =>
    /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
  const a = parse(remote),
    b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
function developerSigned(app) {
  if (!app.isPackaged || process.platform !== "darwin") return false;
  const result = spawnSync(
    "/usr/bin/codesign",
    [
      "-dv",
      "--verbose=4",
      app.getPath("exe").replace(/\/Contents\/MacOS\/[^/]+$/, ""),
    ],
    { encoding: "utf8" },
  );
  return (
    result.status === 0 &&
    /Authority=Developer ID Application:/.test(result.stderr || "")
  );
}
function createUpdates({
  app,
  autoUpdater,
  shell,
  fetch,
  send,
  signed = developerSigned(app),
}) {
  let state = {
    version: app.getVersion(),
    status: "idle",
    automatic: signed,
    availableVersion: null,
    progress: 0,
    error: null,
    url: RELEASES + "/latest",
  };
  const emit = (update) => {
    state = { ...state, ...update };
    send(state);
    return state;
  };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("download-progress", (progress) =>
    emit({ status: "downloading", progress: progress.percent }),
  );
  autoUpdater.on("update-downloaded", () =>
    emit({ status: "ready", progress: 100 }),
  );
  autoUpdater.on("error", (error) =>
    emit({ status: "error", error: error.message }),
  );
  let checking = false;
  async function check() {
    if (checking || ["downloading", "ready"].includes(state.status))
      return state;
    checking = true;
    emit({ status: "checking", error: null });
    try {
      const response = await fetch(
        "https://api.github.com/repos/cullenwebber/glb-viewer/releases/latest",
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "GLB-Viewer/" + app.getVersion(),
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (response.status === 404)
        return emit({ status: "unpublished", availableVersion: null });
      if (!response.ok)
        throw new Error(`Update check failed (${response.status}).`);
      const release = await response.json();
      if (!newer(release.tag_name, app.getVersion()))
        return emit({ status: "current", availableVersion: null });
      if (signed) await autoUpdater.checkForUpdates();
      return emit({
        status: "available",
        availableVersion: release.tag_name,
        url: RELEASES + "/tag/" + encodeURIComponent(release.tag_name),
      });
    } catch (error) {
      return emit({ status: "error", error: error.message });
    } finally {
      checking = false;
    }
  }
  return {
    state: () => state,
    check,
    download: async () => {
      if (state.status !== "available")
        throw new Error("Check for updates first.");
      if (!signed) {
        await shell.openExternal(state.url);
        return state;
      }
      emit({ status: "downloading", progress: 0 });
      try {
        await autoUpdater.downloadUpdate();
      } catch (error) {
        emit({ status: "error", error: error.message });
      }
      return state;
    },
    install: () => {
      if (!signed || state.status !== "ready")
        throw new Error("Download a signed update first.");
      autoUpdater.quitAndInstall();
    },
    openReleases: () => shell.openExternal(RELEASES + "/latest"),
  };
}
module.exports = { newer, createUpdates };
