import assert from "node:assert/strict";
import { _electron as electron, expect } from "@playwright/test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fixture } from "./optimizer-test.mjs";
import { Optimizer } from "../electron/optimizer.mjs";
import { openWorkspace } from "./ui-navigation.mjs";

const directory = await mkdtemp(path.join(tmpdir(), "glb-material-inspector-"));
let app;
try {
  const { file, io, doc } = await fixture(directory);
  const mesh = doc.getRoot().listMeshes()[0];
  const primitive = mesh.listPrimitives()[0];
  const other = doc
    .createMaterial("Blue plastic")
    .setBaseColorFactor([0.1, 0.2, 0.8, 1]);
  const scene = doc.getRoot().listScenes()[0];
  scene.addChild(
    doc.createNode("Shared sphere").setMesh(mesh).setTranslation([-3, 0, 0]),
  );
  scene.addChild(
    doc
      .createNode("Blue sphere")
      .setMesh(
        doc
          .createMesh("Blue mesh")
          .addPrimitive(primitive.clone().setMaterial(other)),
      )
      .setTranslation([3, 0, 0]),
  );
  scene.addChild(
    doc
      .createNode("Two materials")
      .setMesh(
        doc
          .createMesh("Two slots")
          .addPrimitive(primitive.clone())
          .addPrimitive(primitive.clone().setMaterial(other)),
      )
      .setTranslation([0, 3, 0]),
  );
  await writeFile(file, await io.writeBinary(doc));
  const originalBytes = await readFile(file);
  const env = {
    ...process.env,
    GLB_VIEWER_SKIP_SAMPLE: "1",
    GLB_VIEWER_USER_DATA: path.join(directory, "user-data"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: process.env.SMOKE_APP_PATH ? [] : ["."],
    executablePath: process.env.SMOKE_APP_PATH,
    env,
    cwd: process.cwd(),
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator("#triangles").filter({ hasText: "12,800" }).waitFor();
  const load = async (file) => {
    await app.evaluate(
      ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
      file,
    );
    await expect(page.locator("#filename")).toHaveText(path.basename(file));
    await page.locator('#tree [title="Sphere"]').waitFor();
  };
  await load(file);
  await page.locator('#tree [title="Sphere"]').click();
  await expect(page.locator("#selected-object")).toContainText("Paint");
  await page
    .getByRole("button", { name: "Inspect material Paint", exact: true })
    .click();
  const target = page.getByRole("combobox", {
    name: "Target material",
    exact: true,
  });
  await expect(target.locator("option:checked")).toContainText("Paint");
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(4);
  await expect(page.locator('[data-node-type="separateColor"]')).toHaveCount(2);
  await expect(page.locator('[data-node-type="normalMap"]')).toHaveCount(1);
  await expect
    .poll(() =>
      page
        .locator(".material-texture-preview img")
        .evaluateAll(
          (images) =>
            images.filter((image) => image.complete && image.naturalWidth > 0)
              .length,
        ),
    )
    .toBe(4);
  await expect(page.getByLabel("Material assignment")).toContainText(
    "Shared_sphere",
  );
  await page
    .getByLabel("Material graph name", { exact: true })
    .fill("Paint inspected");
  await expect(page.locator(".material-editor-status")).toContainText(
    "Live preview updated",
  );
  await expect(page.locator("#selected-object")).toContainText("Paint");
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(4);
  await openWorkspace(page, "model");
  await page.locator('#tree [title="Blue_sphere"]').click();
  await expect(page.locator("#selected-object")).toContainText("Blue plastic");
  await openWorkspace(page, "materials");
  await expect(target.locator("option:checked")).toContainText("Blue plastic");
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(0);
  await openWorkspace(page, "model");
  await page.locator('#tree [title="Two_materials"]').click();
  await expect(page.locator("#selected-object")).toContainText("Materials (2)");
  await expect(page.locator("#selected-object")).toContainText("Paint");
  await expect(page.locator("#selected-object")).toContainText("Blue plastic");
  await page.locator('#tree [title="Sphere"]').click();
  const viewport = page.locator("#viewport canvas");
  const box = await viewport.boundingBox();
  await viewport.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.locator("#selected-object")).toContainText("Paint");
  await openWorkspace(page, "materials");
  await expect(target.locator("option:checked")).toContainText("Paint");
  await expect(
    page.getByLabel("Material graph name", { exact: true }),
  ).toHaveValue("Paint inspected");
  const graphFile = path.join(directory, "inspected-material.json");
  await app.evaluate(
    ({ BrowserWindow }, file) =>
      BrowserWindow.getAllWindows()[0].webContents.session.once(
        "will-download",
        (_event, item) => item.setSavePath(file),
      ),
    graphFile,
  );
  await page.getByRole("button", { name: "Save graph", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(graphFile, "utf8")).nodes.filter(
          (node) => node.sourceTexture,
        ).length;
      } catch {
        return 0;
      }
    })
    .toBe(4);
  assert.deepEqual(await readFile(file), originalBytes);
  const optimizer = new Optimizer();
  const analysis = await optimizer.open(file);
  await optimizer.optimize({
    geometry: "none",
    textures: analysis.textures.map((texture) => ({
      id: texture.id,
      maxSize: 0,
      format: texture.id === 0 ? "etc1s" : "keep",
    })),
    packs: [],
  });
  const compressedFile = path.join(directory, "compressed.glb");
  await writeFile(compressedFile, await io.writeBinary(optimizer.resultDoc));
  await load(compressedFile);
  await page.locator('#tree [title="Sphere"]').click();
  await openWorkspace(page, "materials");
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(4);
  await expect
    .poll(
      () =>
        page
          .locator(".material-texture-preview img")
          .evaluateAll(
            (images) =>
              images.filter((image) => image.complete && image.naturalWidth > 0)
                .length,
          ),
      { timeout: 30000 },
    )
    .toBe(4);
  await page
    .getByLabel("Material graph name", { exact: true })
    .fill("Compressed inspected");
  await expect(page.locator(".material-editor-status")).toContainText(
    "Live preview updated",
  );
  await load(file);
  await page.locator('#tree [title="Sphere"]').click();
  await openWorkspace(page, "materials");
  await page
    .getByLabel("Import material graph", { exact: true })
    .setInputFiles(graphFile);
  await expect(
    page.getByLabel("Material graph name", { exact: true }),
  ).toHaveValue("Paint inspected");
  await expect(page.locator(".material-editor-status")).toContainText(
    "Live preview updated",
  );
  await expect
    .poll(() =>
      page
        .locator(".material-texture-preview img")
        .evaluateAll(
          (images) =>
            images.filter((image) => image.complete && image.naturalWidth > 0)
              .length,
        ),
    )
    .toBe(4);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: viewport/object material selection, shared and multiple material assignments, source texture thumbnails and channel graphs, draft retention, KTX2 previews, and safe graph editing.",
  );
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
