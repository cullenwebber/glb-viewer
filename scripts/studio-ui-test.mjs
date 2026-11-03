import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  readdir,
  mkdir,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fixture } from "./optimizer-test.mjs";
const directory = await mkdtemp(path.join(tmpdir(), "glb-studio-ui-"));
let app;
try {
  const input = path.join(directory, "inputs");
  await mkdir(input);
  const { file, io, doc } = await fixture(input),
    root = doc.getRoot(),
    buffer = root.listBuffers()[0],
    primitive = root.listMeshes()[0].listPrimitives()[0],
    count = primitive.getAttribute("POSITION").getCount();
  const bone = doc.createNode("Root bone"),
    tip = doc.createNode("Tip bone").setTranslation([0, 1, 0]);
  bone.addChild(tip);
  root.listScenes()[0].addChild(bone);
  const skin = doc.createSkin().addJoint(bone).addJoint(tip).setSkeleton(bone);
  root
    .listNodes()
    .find((n) => n.getMesh())
    .setSkin(skin);
  const joints = new Uint16Array(count * 4),
    weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  primitive.setAttribute(
    "JOINTS_0",
    doc.createAccessor().setType("VEC4").setArray(joints).setBuffer(buffer),
  );
  primitive.setAttribute(
    "WEIGHTS_0",
    doc.createAccessor().setType("VEC4").setArray(weights).setBuffer(buffer),
  );
  const times = doc
      .createAccessor()
      .setType("SCALAR")
      .setArray(new Float32Array([0, 1]))
      .setBuffer(buffer),
    rotations = doc
      .createAccessor()
      .setType("VEC4")
      .setArray(
        new Float32Array([0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2]),
      )
      .setBuffer(buffer);
  const sampler = doc
    .createAnimationSampler()
    .setInput(times)
    .setOutput(rotations);
  doc
    .createAnimation("Turn")
    .addSampler(sampler)
    .addChannel(
      doc
        .createAnimationChannel()
        .setTargetNode(bone)
        .setTargetPath("rotation")
        .setSampler(sampler),
    );
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
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Shader Error|VALIDATE_STATUS|WebGLProgram/.test(message.text())
    )
      errors.push(message.text());
  });
  await page.locator("#triangles").filter({ hasText: "12,800" }).waitFor();
  await app.evaluate(
    ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
    file,
  );
  await page.locator("#filename").filter({ hasText: "fixture.glb" }).waitFor();
  for (const mode of [
    "baseColor",
    "roughness",
    "metalness",
    "normals",
    "normalMap",
    "ao",
    "alpha",
    "checker",
    "orientation",
    "weights",
    "cost",
  ]) {
    await page.locator("#surface-mode").selectOption(mode);
    if (mode === "weights")
      await page.getByLabel("Weight bone").selectOption({ label: "Root_bone" });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  await page.locator("#surface-mode").selectOption("checker");
  await page.locator("#open-uv").click();
  await page.locator("#uv-layout").waitFor();
  await page
    .getByLabel("UV mesh", { exact: true })
    .selectOption({ label: "Sphere" });
  await page.getByLabel("UV background").selectOption("texture");
  await page.screenshot({ path: path.join(tmpdir(), "glb-studio-uv.png") });
  await page.keyboard.press("Escape");
  await page.locator("#surface-mode").selectOption("material");
  await page.locator('[data-tab="textures"]').click();
  await page.locator("#wb-count").filter({ hasText: "4" }).waitFor();
  await page.locator("#wb-geometry").selectOption("meshopt");
  await page.locator('[data-tab="presets"]').click();
  await page.locator("#save-current-preset").click();
  await page.locator("#preset-name").fill("Batch web");
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  await page.locator("[data-preset]").waitFor();
  await page.locator("#wb-run").click();
  await page
    .locator("#wb-notice")
    .filter({ hasText: "Optimization complete" })
    .waitFor({ timeout: 15000 })
    .catch(async (error) => {
      console.log(await page.locator("#workbench").textContent());
      throw error;
    });
  await page.locator('[data-tab="compare"]').click();
  await page.locator(".comparison-views canvas").nth(1).waitFor();
  await page.getByLabel("Comparison animation").selectOption("0");
  await page.getByLabel("Comparison timeline").fill("0.6");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const box = await page
    .locator(".comparison-views canvas")
    .first()
    .boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 70,
    box.y + box.height / 2 + 20,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.screenshot({
    path: path.join(tmpdir(), "glb-studio-compare.png"),
  });
  await page.locator('[data-tab="history"]').click();
  await page.locator("[data-history]").waitFor();
  const name = page.locator("[data-history] input").first();
  await name.fill("Web final");
  await name.press("Tab");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page
    .locator("#wb-notice")
    .filter({ hasText: "Run restored" })
    .waitFor();
  await page.locator('[data-tab="budgets"]').click();
  await page.locator("#budget-name").fill("Mobile test");
  await page.locator("#budget-triangles").fill("1");
  await page.locator("#save-budget").click();
  await page
    .locator("#wb-notice")
    .filter({ hasText: "Project budget saved" })
    .waitFor();
  await app.evaluate(
    ({ dialog }, folder) =>
      (dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      })),
    input,
  );
  await page.locator('[data-tab="batch"]').click();
  await page.locator("#batch-choose").click();
  await page.locator('[data-batch-row="0"]').waitFor();
  await page.getByLabel("Batch budget").selectOption({ label: "Mobile test" });
  await app.evaluate(
    ({ dialog }, folder) =>
      (dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      })),
    directory,
  );
  await page.locator("#batch-run").click();
  await page
    .locator('[data-batch-row="0"]')
    .filter({ hasText: "complete" })
    .waitFor({ timeout: 60000 });
  const output = (await readdir(directory)).find((name) =>
    name.startsWith("glb-batch-"),
  );
  assert(output);
  const batch = JSON.parse(
    await readFile(path.join(directory, output, "batch-report.json"), "utf8"),
  );
  assert(batch.rows[0].budgets.some((row) => row.exceeded));
  await page.locator('[data-tab="history"]').click();
  assert.match(
    await page.locator("[data-history] input").first().inputValue(),
    /Web final/,
  );
  await page.locator("#wb-run").click();
  await page
    .locator("#wb-notice")
    .filter({ hasText: "Optimization complete" })
    .waitFor({ timeout: 60000 });
  await page.locator('[data-tab="history"]').click();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-history]").length === 2,
  );
  await page.getByRole("checkbox").nth(0).click();
  await page.getByRole("checkbox").nth(1).click();
  await page
    .getByRole("button", { name: "Compare selected", exact: true })
    .click();
  await page.locator(".comparison-views canvas").nth(1).waitFor();
  await page
    .getByRole("button", { name: "Back to history", exact: true })
    .click();
  // Cancel a longer queue and verify its state survives navigation.
  const bytes = await readFile(file);
  for (let i = 0; i < 12; i++)
    await writeFile(path.join(input, `copy-${i}.glb`), bytes);
  await app.evaluate(
    ({ dialog }, folder) =>
      (dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      })),
    input,
  );
  await page.locator('[data-tab="batch"]').click();
  await page.locator("#batch-choose").click();
  await app.evaluate(
    ({ dialog }, folder) =>
      (dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      })),
    directory,
  );
  await page.locator("#batch-run").click();
  await page.locator('[data-tab="history"]').click();
  await page.locator('[data-tab="batch"]').click();
  await page.getByRole("button", { name: "Cancel batch", exact: true }).click();
  await page
    .locator('[data-batch-row="12"]')
    .filter({ hasText: "cancelled" })
    .waitFor();
  const folders = (await readdir(directory)).filter((name) =>
    name.startsWith("glb-batch-"),
  );
  assert.equal(folders.length, 2);
  const cancelled = await Promise.all(
    folders.map((folder) =>
      readFile(path.join(directory, folder, "batch-report.json"), "utf8").then(
        JSON.parse,
      ),
    ),
  );
  assert(cancelled.some((report) => report.cancelled));
  await page.locator("#app-updates").click();
  await page.locator("#update-status").waitFor();
  assert.match(
    await page.getByRole("dialog").textContent(),
    /manual updates|signed app/,
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: all material/weight shaders, UV inspector, linked animated comparison, saved history restore/rename, project budgets, validated batch export, and update UI.",
  );
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
