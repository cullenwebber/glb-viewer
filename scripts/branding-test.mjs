import { _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const directory = await mkdtemp(path.join(tmpdir(), "glb-branding-"));
let app;
try {
  const env = { ...process.env, GLB_VIEWER_USER_DATA: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: process.env.SMOKE_APP_PATH ? [] : ["."],
    executablePath: process.env.SMOKE_APP_PATH,
    cwd: process.cwd(),
    env,
  });
  const page = await app.firstWindow();
  await page.locator("#triangles").filter({ hasText: "12,800" }).waitFor();
  const identity = await app.evaluate(
    ({ app, Menu, BrowserWindow, nativeImage }) => ({
      name: app.getName(),
      title: BrowserWindow.getAllWindows()[0].getTitle(),
      process: process.title,
      menu: Menu.getApplicationMenu().items[0].label,
      userData: app.getPath("userData"),
      icon: nativeImage
        .createFromPath(app.getAppPath() + "/assets/icon.png")
        .getSize(),
    }),
  );
  assert.equal(identity.name, "GLB Viewer");
  assert.equal(identity.title, "GLB Viewer");
  assert.equal(identity.process, "GLB Viewer");
  assert.equal(identity.menu, "GLB Viewer");
  assert.equal(identity.userData, directory);
  assert.equal(identity.icon.width, 512);
  console.log(
    "PASS: GLB Viewer app/process/window/menu identity, bundled 512px icon, and preserved user-data location.",
  );
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
