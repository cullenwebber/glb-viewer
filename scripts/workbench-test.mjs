import { openWorkspace } from "./ui-navigation.mjs";
import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { fixture } from "./optimizer-test.mjs";
const directory = await mkdtemp(path.join(tmpdir(), "glb-workbench-"));
let app;
try {
  const { file, io } = await fixture(directory);
  const env = {
    ...process.env,
    GLB_VIEWER_USER_DATA: path.join(directory, "user-data"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: process.env.SMOKE_APP_PATH ? [] : ["."],
    executablePath: process.env.SMOKE_APP_PATH,
    env,
    cwd: process.cwd(),
  });
  const page = await app.firstWindow(),
    errors = [];
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.log("PAGE ERROR", error.message);
  });
  await page.locator("#triangles").filter({ hasText: "12,800" }).waitFor();
  await app.evaluate(
    ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
    file,
  );
  await page.locator("#filename").filter({ hasText: "fixture.glb" }).waitFor();
  await openWorkspace(page, "textures");
  await page
    .locator("#wb-count")
    .filter({ hasText: "4" })
    .waitFor({ timeout: 30000 });
  await page.screenshot({
    path: path.join(tmpdir(), "glb-workbench-ready.png"),
  });
  await page.locator('[data-texture="0"]').click();
  await page.locator("#wb-image-loading").waitFor({ state: "hidden" });
  const stage = page.locator("#wb-image-stage");
  await page.locator("#wb-zoom").fill("200");
  assert.equal(await stage.getAttribute("data-zoom"), "2");
  const bounds = await stage.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 70,
    bounds.y + bounds.height / 2 + 40,
  );
  await page.mouse.up();
  assert.equal(await stage.getAttribute("data-pan-x"), "70");
  assert.equal(await stage.getAttribute("data-pan-y"), "40");
  await page.mouse.wheel(0, -100);
  await page.waitForFunction(
    () => Number(document.querySelector("#wb-image-stage").dataset.zoom) > 2,
  );
  await page.locator("#wb-fit").click();
  assert.equal(await stage.getAttribute("data-pan-x"), "0");
  assert.equal(await stage.getAttribute("data-zoom"), "1");
  await page.locator('[data-channel="R"]').click();
  const red = await page
    .locator("#wb-image")
    .evaluate((canvas) => [
      ...canvas.getContext("2d").getImageData(0, 0, 1, 1).data,
    ]);
  assert.deepEqual(red, [180, 180, 180, 255]);
  await page.locator("#wb-format").selectOption("etc1s");
  await page
    .getByRole("spinbutton", { name: "ETC1S quality", exact: true })
    .fill("180");
  await page
    .getByRole("spinbutton", { name: "Encoder effort", exact: true })
    .fill("3");
  await page
    .getByRole("switch", { name: "Generate mipmaps", exact: true })
    .click();
  await page.locator('[data-texture="1"]').click();
  await page.locator("#wb-format").selectOption("uastc");
  await page.locator("#wb-geometry").selectOption("meshopt");
  await page.locator("#geometry-settings").click();
  await page.locator("#meshopt-level").selectOption("high");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await openWorkspace(page, "packing");
  await page.locator("#wb-add-pack").click();
  await page.locator('[data-field="size"]').selectOption("256");
  await page.locator("#wb-run").click();
  await page
    .locator("#wb-notice")
    .filter({ hasText: "Optimization complete" })
    .waitFor({ timeout: 60000 });
  assert.equal(await page.locator("#wb-report tbody tr").count(), 5);
  assert.equal(
    await page.locator('[data-tab="report"]').getAttribute("data-state"),
    "active",
  );
  await page.screenshot({
    path: path.join(tmpdir(), "glb-workbench-report.png"),
  });
  await openWorkspace(page, "textures");
  await page.locator('[data-texture="0"]').click();
  await page.locator("#wb-version").selectOption("output");
  try {
    await page.locator("#wb-image-loading").waitFor({ state: "hidden" });
  } catch (error) {
    console.log(
      "KTX decode status:",
      await page.locator("#wb-image-loading").textContent(),
    );
    throw error;
  }
  await page.screenshot({
    path: path.join(tmpdir(), "glb-workbench-textures.png"),
  });
  const destination = path.join(directory, "optimized.glb");
  await app.evaluate(
    ({ dialog }, file) =>
      (dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: file,
      })),
    destination,
  );
  await page.locator("#wb-export").click();
  await page.locator("#wb-notice").filter({ hasText: "Exported" }).waitFor();
  const exported = await io.readBinary(
    new Uint8Array(await readFile(destination)),
  );
  assert.equal(exported.getRoot().listTextures().length, 3);
  const { read: readKTX } = await import("ktx-parse");
  assert.equal(
    readKTX(exported.getRoot().listTextures()[0].getImage()).levels.length,
    1,
  );
  assert(
    exported
      .getRoot()
      .listExtensionsUsed()
      .some((ext) => ext.extensionName === "EXT_meshopt_compression"),
  );
  // The actual renderer must be able to display the newly compressed model.
  await page.locator("#wb-preview").click();
  await page
    .locator("#filename")
    .filter({ hasText: "fixture-optimized.glb" })
    .waitFor();
  await openWorkspace(page, "textures");
  await page.locator("#wb-original").click();
  await page.locator("#filename").filter({ hasText: "fixture.glb" }).waitFor();
  const input = path.join(directory, "custom-roughness.png");
  await writeFile(
    input,
    await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 90, g: 90, b: 90, alpha: 1 },
      },
    })
      .png()
      .toBuffer(),
  );
  await app.evaluate(
    ({ dialog }, file) =>
      (dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      })),
    input,
  );
  await openWorkspace(page, "textures");
  await page.locator("#wb-import").click();
  await page.locator("#wb-count").filter({ hasText: "5" }).waitFor();
  await openWorkspace(page, "packing");
  await page.locator('[data-source="1"]').selectOption("4");
  await page.locator('[data-input-channel="1"]').selectOption("0");
  await page.locator("#wb-geometry").selectOption("draco");
  await page.locator("#geometry-settings").click();
  await page
    .getByRole("spinbutton", { name: "Position precision (bits)", exact: true })
    .fill("12");
  await page
    .getByRole("spinbutton", { name: "Encode speed", exact: true })
    .fill("3");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator("#wb-run").click();
  await page
    .locator("#wb-notice")
    .filter({ hasText: "Optimization complete" })
    .waitFor({ timeout: 60000 });
  await page.locator("#wb-export").click();
  await page.locator("#wb-notice").filter({ hasText: "Exported" }).waitFor();
  const imported = await io.readBinary(
    new Uint8Array(await readFile(destination)),
  );
  const orm = imported
    .getRoot()
    .listMaterials()[0]
    .getMetallicRoughnessTexture();
  const pixels = await sharp(orm.getImage()).ensureAlpha().raw().toBuffer();
  assert.equal(pixels[1], 90);
  assert.equal(imported.getRoot().listTextures().length, 3);
  await page.locator("#wb-preview").click();
  await page
    .locator("#filename")
    .filter({ hasText: "fixture-optimized.glb" })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Electron worker analysis, RGBA debugging, per-texture settings, meshopt + KTX2 + ORM pipeline, report, native export, Three.js optimized preview, original switch, imported packing inputs.",
  );
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
