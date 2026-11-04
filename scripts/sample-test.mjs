import assert from "node:assert/strict";
import { _electron as electron, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openWorkspace } from "./ui-navigation.mjs";

const directory = await mkdtemp(path.join(tmpdir(), "glb-sample-"));
let app;
try {
  const env = {
    ...process.env,
    GLB_VIEWER_USER_DATA: path.join(directory, "user-data"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.GLB_VIEWER_SKIP_SAMPLE;
  app = await electron.launch({
    args: process.env.SMOKE_APP_PATH ? [] : ["."],
    executablePath: process.env.SMOKE_APP_PATH,
    cwd: process.cwd(),
    env,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(60000);
  await page.locator("#triangles").filter({ hasText: "141,802" }).waitFor();
  await expect(page.locator("#filename")).toHaveText("LittlestTokyo.glb");
  await expect(page.locator(".sample-note")).toContainText(
    "Littlest Tokyo by Glen Fox, CC Attribution",
  );
  await openWorkspace(page, "textures");
  await page.getByText("baseColor.jpg").first().waitFor();
  assert.equal(await page.locator("[data-texture]").count(), 4);
  console.log(
    "PASS: bundled sample opens first, credits its author, and is available to the texture tools.",
  );
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
