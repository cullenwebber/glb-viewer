import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixture } from "./optimizer-test.mjs";
import { openWorkspace } from "./ui-navigation.mjs";
const directory = await mkdtemp(path.join(tmpdir(), "glb-resize-"));
let app;
const width = async (page, selector) =>
  (await page.locator(selector).boundingBox()).width;
async function drag(page, selector, dx) {
  const box = await page.locator(selector).boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
}
async function launch() {
  const env = {
    ...process.env,
    GLB_VIEWER_SKIP_SAMPLE: "1",
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
  // macOS may constrain the initial BrowserWindow to the hosted runner's screen.
  // Use a known workspace width for the large-drag and persistence assertions.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 960),
  );
  await page.waitForFunction(() => innerWidth === 1440);
  await page.locator("#triangles").filter({ hasText: "12,800" }).waitFor();
  return page;
}
try {
  const { file, io, doc } = await fixture(directory),
    scene = doc.getRoot().listScenes()[0],
    mesh = doc.getRoot().listNodes()[0],
    name = "Boeing_787_Dreamliner_fuselage";
  scene.removeChild(mesh);
  mesh.setName(name);
  let parent = scene;
  for (let i = 0; i < 5; i++) {
    const node = doc.createNode("Assembly_" + i);
    parent.addChild(node);
    parent = node;
  }
  parent.addChild(mesh);
  await writeFile(file, await io.writeBinary(doc));
  let page = await launch();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(
    ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
    file,
  );
  await page.locator("#filename").filter({ hasText: "fixture.glb" }).waitFor();
  const label = page
    .locator("#tree [data-node-id]")
    .filter({ hasText: name })
    .locator("span");
  assert(
    await label.evaluate((node) => node.scrollWidth > node.clientWidth),
    "deep name initially truncates",
  );
  const heights = await page.evaluate(() => ({
    workspace: document.querySelector(".app-workspace").clientHeight,
    scene: document.querySelector(".scene-sidebar").clientHeight,
    viewer: document.querySelector(".viewer-main").clientHeight,
    inspector: document.querySelector(".model-inspector").clientHeight,
  }));
  assert(Math.abs(heights.workspace - heights.scene) < 3);
  assert(Math.abs(heights.workspace - heights.viewer) < 3);
  assert(Math.abs(heights.workspace - heights.inspector) < 3);
  const originalScene = await width(page, ".scene-sidebar"),
    originalInspector = await width(page, ".model-inspector");
  await drag(page, "#model-panels-left-divider", 250);
  const sceneWidth = await width(page, ".scene-sidebar");
  assert(sceneWidth > originalScene + 180);
  assert(
    await label.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    "widening reveals the complete name",
  );
  await drag(page, "#model-panels-right-divider", -140);
  const inspectorWidth = await width(page, ".model-inspector");
  assert(inspectorWidth > originalInspector + 100);
  await openWorkspace(page, "textures");
  await page.locator("#wb-count").filter({ hasText: "4" }).waitFor();
  const originalLibrary = await width(page, ".texture-library"),
    originalProperties = await width(page, ".texture-settings-panel");
  await drag(page, "#texture-panels-left-divider", 90);
  assert((await width(page, ".texture-library")) > originalLibrary + 60);
  await drag(page, "#texture-panels-right-divider", -90);
  assert(
    (await width(page, ".texture-settings-panel")) > originalProperties + 60,
  );
  const textureWidth = await width(page, ".texture-library");
  await openWorkspace(page, "model");
  assert(Math.abs((await width(page, ".scene-sidebar")) - sceneWidth) < 4);
  assert(
    Math.abs((await width(page, ".model-inspector")) - inspectorWidth) < 4,
  );
  await page.locator("#model-panels-left-divider").focus();
  await page.keyboard.press("ArrowRight");
  assert((await width(page, ".scene-sidebar")) > sceneWidth);
  const savedWidth = await width(page, ".scene-sidebar");
  await page.screenshot({
    path: path.join(tmpdir(), "glb-resizable-scene.png"),
  });
  await app.close();
  app = undefined;
  page = await launch();
  assert(
    Math.abs((await width(page, ".scene-sidebar")) - savedWidth) < 4,
    "model widths survive app restart",
  );
  await app.evaluate(
    ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
    file,
  );
  await page.locator("#filename").filter({ hasText: "fixture.glb" }).waitFor();
  await openWorkspace(page, "textures");
  assert(
    Math.abs((await width(page, ".texture-library")) - textureWidth) < 4,
    "texture widths survive app restart",
  );
  await openWorkspace(page, "model");
  await page.locator("#model-panels-left-divider").dblclick();
  assert(
    Math.abs((await width(page, ".scene-sidebar")) - originalScene) < 6,
    "double click resets widths",
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(960, 720),
  );
  await page.waitForFunction(() => innerWidth === 960);
  await drag(page, "#model-panels-left-divider", 800);
  assert((await width(page, ".viewer-main")) >= 238);
  assert((await width(page, ".model-inspector")) >= 238);
  assert(
    await page.evaluate(
      () =>
        document.querySelector("#model-panels").getBoundingClientRect().right <=
        innerWidth + 1,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: scene/inspector and texture panel dragging, readable deep names, independent saved widths, app restart persistence, keyboard resizing, double-click reset, and minimum viewport constraints.",
  );
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
