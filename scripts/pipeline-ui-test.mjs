import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
  rename,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fixture } from "./optimizer-test.mjs";
const directory = await mkdtemp(path.join(tmpdir(), "glb-pipeline-ui-"));
let app;
async function launch() {
  const env = {
    ...process.env,
    GLB_VIEWER_USER_DATA: path.join(directory, "user-data"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: process.env.SMOKE_APP_PATH ? [] : ["."],
    executablePath: process.env.SMOKE_APP_PATH,
    cwd: process.cwd(),
    env,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await page.locator("#triangles").filter({ hasText: "12,800" }).waitFor();
  return page;
}
try {
  const { file, io, doc } = await fixture(directory);
  const primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  primitive.getMaterial().setDoubleSided(true);
  primitive.setAttribute(
    "TEXCOORD_1",
    primitive.getAttribute("TEXCOORD_0").clone(),
  );
  await writeFile(file, await io.writeBinary(doc));
  let page = await launch();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(
    ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
    file,
  );
  await page.locator("#filename").filter({ hasText: "fixture.glb" }).waitFor();
  await page.locator('[data-tab="checks"]').click();
  await page.locator("#checks-summary").waitFor();
  assert.match(await page.locator("#checks-summary").textContent(), /Errors0/);
  await page.locator("#checks-fix-all").click();
  await page
    .getByRole("button", { name: "Undo fix", exact: true })
    .first()
    .waitFor();
  await page.locator('[data-tab="performance"]').click();
  await page.locator("#perf-frame-ms").waitFor();
  await page.locator("#perf-transmission").click();
  await page.locator("#perf-pixel-ratio").selectOption("1");
  await page
    .getByRole("button", { name: "Isolate Sphere", exact: true })
    .click();
  await page.getByRole("button", { name: "Show all", exact: true }).click();
  await page.locator('[data-tab="textures"]').click();
  await page.locator("#wb-count").filter({ hasText: "4" }).waitFor();
  await page.locator('[data-texture="0"]').click();
  await page.locator("#wb-format").selectOption("webp");
  await page
    .getByRole("spinbutton", { name: "Image quality", exact: true })
    .fill("82");
  await page.locator("#wb-geometry").selectOption("meshopt");
  await page.locator('[data-tab="geometry"]').click();
  await page
    .getByRole("spinbutton", { name: "Keep triangles (%)", exact: true })
    .fill("50");
  await page
    .getByRole("spinbutton", { name: "Maximum error (%)", exact: true })
    .fill("20");
  await page.locator("#lod-levels").selectOption("0.5,0.25");
  await page.locator("#opt-dedup").click();
  await page.locator("#opt-resample").click();
  await page.locator('[data-tab="presets"]').click();
  await page.locator("#save-current-preset").click();
  await page.locator("#preset-name").fill("Blender web preset");
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  await page
    .locator("[data-preset]")
    .filter({ hasText: "Blender web preset" })
    .waitFor();
  await page.locator("#wb-run").click();
  await page
    .locator("#wb-notice")
    .filter({ hasText: "Optimization complete" })
    .waitFor({ timeout: 60000 });
  await page.locator('[data-tab="checks"]').click();
  await page.getByLabel("Validation target").selectOption("optimized");
  await page.locator("#checks-summary").waitFor();
  await page
    .getByText("double sided", { exact: true })
    .waitFor({ state: "hidden" });
  await page
    .getByText("unused object", { exact: true })
    .waitFor({ state: "hidden" });
  await app.evaluate(
    ({ dialog }, directory) =>
      (dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directory],
      })),
    directory,
  );
  await page.locator('[data-tab="export"]').click();
  await page.locator("#export-bundle").click();
  await page
    .locator("#wb-notice")
    .filter({ hasText: "Exported Three.js bundle" })
    .waitFor();
  const bundle = (await readdir(directory)).find((name) =>
    name.startsWith("fixture-threejs-"),
  );
  assert(bundle);
  const metadata = JSON.parse(
    await readFile(path.join(directory, bundle, "assets.json"), "utf8"),
  );
  assert.equal(metadata.lods.length, 2);
  const output = await io.readBinary(
    new Uint8Array(await readFile(path.join(directory, bundle, "model.glb"))),
  );
  assert(
    output
      .getRoot()
      .listMeshes()[0]
      .listPrimitives()[0]
      .getIndices()
      .getCount() <
      doc.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount(),
  );
  await page.locator('[data-tab="textures"]').click();
  await page.locator("#watch-model").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#watch-model").getAttribute("aria-pressed") ===
      "true",
  );
  // Simulate Blender's atomic replace while retaining the same image roles and names.
  doc.getRoot().listMaterials()[0].setRoughnessFactor(0.45);
  const replacement = path.join(directory, "new-export.glb");
  await writeFile(replacement, await io.writeBinary(doc));
  await rename(replacement, file);
  await page
    .locator("#wb-notice")
    .filter({ hasText: "Blender export reloaded" })
    .waitFor({ timeout: 20000 });
  await page.locator('[data-texture="0"]').click();
  assert.equal(await page.locator("#wb-format").inputValue(), "webp");
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Image quality", exact: true })
      .inputValue(),
    "82",
  );
  await page.locator('[data-tab="geometry"]').click();
  assert.equal(await page.locator("#lod-levels").inputValue(), "0.5,0.25");
  await page.locator("#watch-model").click();
  await page.screenshot({
    path: path.join(tmpdir(), "glb-geometry-workflow.png"),
  });
  // Persistence across app restarts: library, not just in-memory component state.
  await app.close();
  app = undefined;
  page = await launch();
  await app.evaluate(
    ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
    file,
  );
  await page.locator("#filename").filter({ hasText: "fixture.glb" }).waitFor();
  await page.locator('[data-tab="presets"]').click();
  await page
    .locator("[data-preset]")
    .filter({ hasText: "Blender web preset" })
    .waitFor();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page
    .locator("#wb-notice")
    .filter({ hasText: "Preset applied" })
    .waitFor();
  await page.locator('[data-tab="textures"]').click();
  await page.locator('[data-texture="0"]').click();
  assert.equal(await page.locator("#wb-format").inputValue(), "webp");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Checks and Performance, viewport experiments/isolation, geometry/LOD settings, persistent presets, complete native export bundle, Blender atomic reload and recipe restoration across restarts.",
  );
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
