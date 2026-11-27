import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const file = path.resolve(
  process.env.OPEN_FILE_TEST_GLB || "assets/samples/LittlestTokyo.glb",
);
const screenshot = path.resolve(
  process.env.OPEN_FILE_TEST_SHOT ||
    path.join(tmpdir(), "glb-viewer-open-file.png"),
);
try {
  await access(file);
} catch {
  console.error("open-file-test: no such file " + file);
  process.exit(1);
}

const directory = await mkdtemp(path.join(tmpdir(), "glb-viewer-test-"));
let app;
try {
  const env = {
    ...process.env,
    GLB_VIEWER_SKIP_SAMPLE: "1",
    GLB_VIEWER_USER_DATA: path.join(directory, "user-data"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: [...(process.env.SMOKE_APP_PATH ? [] : ["."]), file],
    executablePath: process.env.SMOKE_APP_PATH,
    cwd: process.cwd(),
    env,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const result = await page.waitForFunction(
    () => {
      const text = document.querySelector("#triangles")?.textContent || "";
      const count = Number.parseInt(text.replace(/[,\s.'\u2019]/g, ""), 10);
      return Number.isInteger(count) && count > 0 ? count : false;
    },
    undefined,
    { timeout: 30000 },
  );
  const count = await result.jsonValue();
  await page.screenshot({ path: screenshot });
  assert.deepEqual(errors, [], "No uncaught renderer errors");
  console.log("open-file-test: " + count + " triangles, " + screenshot);
} catch (error) {
  console.error(
    error.name === "TimeoutError"
      ? "open-file-test: timed out"
      : "open-file-test: " + error.message,
  );
  process.exitCode = 1;
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
