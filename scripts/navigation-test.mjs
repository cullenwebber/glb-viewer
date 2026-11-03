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
  page.on("pageerror", (e) => errors.push(e.message));
  await page.locator("#triangles").filter({ hasText: "12,800" }).waitFor();
  assert.equal(await page.locator(".app-titlebar [data-section]").count(), 4);
  assert.equal(
    await page.locator(".workspace-navigation [data-tab]").count(),
    4,
  );
  assert.equal(await page.locator(".app-titlebar #app-updates").count(), 0);
  assert.equal(await page.locator("#watch-model").count(), 0);
  await app.evaluate(
    ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
    file,
  );
  await page.locator("#title-file").filter({ hasText: name }).waitFor();
  await page.locator("#wb-count").filter({ hasText: "4" }).waitFor();
  const groups = {
    inspect: ["model", "textures", "checks", "performance"],
    optimize: ["geometry", "packing", "presets"],
    review: ["compare", "report", "history", "export"],
    tools: ["batch", "budgets"],
  };
  for (const [group, pages] of Object.entries(groups)) {
    await page.locator(`[data-section="${group}"]`).click();
    assert.deepEqual(
      await page
        .locator(".workspace-navigation [data-tab]")
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.tab)),
      pages,
    );
    for (const tab of pages) {
      await openWorkspace(page, tab);
      assert.equal(
        await page.locator(`[data-tab="${tab}"]`).getAttribute("data-state"),
        "active",
      );
      if (["textures", "geometry", "packing"].includes(tab))
        assert(await page.locator(".workbench-toolbar").isVisible());
      else assert.equal(await page.locator(".workbench-toolbar").count(), 0);
    }
  }
  await openWorkspace(page, "packing");
  await openWorkspace(page, "report");
  await page.locator('[data-section="optimize"]').click();
  assert.equal(
    await page.locator('[data-tab="packing"]').getAttribute("data-state"),
    "active",
  );
  await page.locator('[data-section="inspect"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-section="optimize"]')
        .getAttribute("data-state") === "active",
  );
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
  await openWorkspace(page, "model");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(960, 720),
  );
  await page.waitForFunction(() => window.innerWidth === 960);
  const layout = await page.evaluate(() => {
    const header = document.querySelector(".app-titlebar"),
      sections = document.querySelector(".workspace-sections"),
      identity = document.querySelector(".app-identity"),
      actions = document.querySelector(".header-actions"),
      nav = document.querySelector(".workspace-navigation");
    const rect = (node) => ({
      left: node.getBoundingClientRect().left,
      right: node.getBoundingClientRect().right,
    });
    return {
      overflow: header.scrollWidth > header.clientWidth,
      identity: rect(identity),
      sections: rect(sections),
      actions: rect(actions),
      navOverflow: nav.scrollWidth > nav.clientWidth,
      width: window.innerWidth,
      filename: rect(document.querySelector("#filename")),
      triangles: rect(document.querySelector("#triangles")),
    };
  });
  assert(!layout.overflow);
  assert(!layout.navOverflow);
  assert(layout.identity.right <= layout.sections.left);
  assert(layout.sections.right <= layout.actions.left);
  assert(layout.actions.right <= layout.width);
  assert(layout.filename.right <= layout.width);
  assert(layout.triangles.right <= layout.width);
  await page.screenshot({
    path: path.join(tmpdir(), "glb-navigation-960.png"),
  });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 960),
  );
  await page.waitForFunction(() => window.innerWidth === 1440);
  await page.screenshot({
    path: path.join(tmpdir(), "glb-navigation-1440.png"),
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: all 13 pages in four sections, contextual settings, section memory, keyboard navigation, menu dialogs, stable source identity, and 960px layout without overlap.",
  );
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
