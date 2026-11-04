import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixture } from "./optimizer-test.mjs";
import { openWorkspace, openUpdates } from "./ui-navigation.mjs";
const directory = await mkdtemp(path.join(tmpdir(), "glb-navigation-"));
let app;
try {
  const { io, doc } = await fixture(directory),
    name =
      "sculpture-with-a-very-long-descriptive-asset-name-for-the-web-project.glb",
    file = path.join(directory, name);
  await writeFile(file, await io.writeBinary(doc));
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
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator("#triangles").filter({ hasText: "12,800" }).waitFor();
  assert.equal(await page.locator(".app-titlebar [data-tab]").count(), 0);
  assert.equal(await page.locator(".workspace-sidebar [data-tab]").count(), 14);
  assert.equal(
    await page.locator(".workspace-sidebar [data-section]").count(),
    4,
  );
  assert.equal(await page.locator("#watch-model").count(), 0);
  await app.evaluate(
    ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
    file,
  );
  await page.locator("#title-file").filter({ hasText: name }).waitFor();
  await page.locator("#wb-count").filter({ hasText: "4" }).waitFor();
  const groups = {
    inspect: ["model", "textures", "materials", "checks", "performance"],
    optimize: ["geometry", "packing", "presets"],
    review: ["compare", "report", "history", "export"],
    tools: ["batch", "budgets"],
  };
  for (const [group, pages] of Object.entries(groups)) {
    assert.deepEqual(
      await page
        .locator(`[data-section="${group}"] [data-tab]`)
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.tab)),
      pages,
    );
    for (const tab of pages) {
      await openWorkspace(page, tab);
      assert.equal(
        await page.locator(`[data-tab="${tab}"]`).getAttribute("aria-current"),
        "page",
      );
      assert.equal(
        await page.locator(".workspace-sidebar [data-tab]").count(),
        14,
      );
      if (["textures", "geometry", "packing"].includes(tab))
        assert(await page.locator(".workbench-toolbar").isVisible());
      else assert.equal(await page.locator(".workbench-toolbar").count(), 0);
    }
  }
  await openWorkspace(page, "model");
  await page.locator('[data-tab="model"]').focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page
      .locator('[data-tab="textures"]')
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Enter");
  assert.equal(
    await page.locator('[data-tab="textures"]').getAttribute("aria-current"),
    "page",
  );
  const expanded = await page.locator(".workspace-sidebar").boundingBox();
  await page.locator("#toggle-navigation").click();
  const compact = await page.locator(".workspace-sidebar").boundingBox();
  assert(compact.width < expanded.width - 80);
  assert.equal(await page.locator(".workspace-sidebar [data-tab]").count(), 14);
  await page.reload();
  await page.locator("#triangles").filter({ hasText: "12,800" }).waitFor();
  assert(
    await page
      .locator(".workspace-sidebar")
      .evaluate((node) => node.classList.contains("is-compact")),
  );
  await page.locator("#toggle-navigation").click();
  await page.locator("#app-menu").click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  await page
    .getByRole("heading", { name: "Keyboard shortcuts", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await openUpdates(page);
  await page
    .getByRole("heading", { name: "App updates", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await app.evaluate(
    ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
    file,
  );
  await page.locator("#filename").filter({ hasText: name }).waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(960, 720),
  );
  await page.waitForFunction(() => innerWidth === 960);
  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width };
    };
    return {
      width: innerWidth,
      header: document.querySelector(".app-titlebar").scrollWidth,
      sidebar: rect(".workspace-sidebar"),
      stage: rect(".asset-stage"),
      filename: rect("#filename"),
      triangles: rect("#triangles"),
    };
  });
  assert(layout.header <= layout.width);
  assert(layout.sidebar.right <= layout.stage.left + 1);
  assert(layout.stage.right <= layout.width + 1);
  assert(layout.filename.right <= layout.width);
  assert(layout.triangles.right <= layout.width);
  await page.screenshot({
    path: path.join(tmpdir(), "glb-navigation-960.png"),
  });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 960),
  );
  await page.waitForFunction(() => innerWidth === 1440);
  await page.screenshot({
    path: path.join(tmpdir(), "glb-navigation-1440.png"),
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 14 permanently available tools in a labelled sidebar, page navigation, keyboard access, persisted compact mode, app menus, and 960px layout.",
  );
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
