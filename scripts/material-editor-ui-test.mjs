import assert from "node:assert/strict";
import { _electron as electron, expect as baseExpect } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import {
  createMaterialGraph,
  createMaterialNode,
  connectMaterialNodes,
  materialOutputs,
} from "../src/lib/material-editor.ts";
import { tmpdir } from "node:os";
import path from "node:path";
import { compileMaterialGraph } from "../electron/pipeline/material-graph.mjs";
import sharp from "sharp";
import { openWorkspace } from "./ui-navigation.mjs";

const directory = await mkdtemp(path.join(tmpdir(), "glb-material-editor-"));
let app;
const errors = [];
const expect = baseExpect.configure({ timeout: 15000 });
try {
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
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.locator("#triangles").filter({ hasText: "12,800" }).waitFor();
  await expect(page.locator(".viewport-mode")).toContainText(
    /WebGPU|WebGL 2 fallback/,
  );
  await openWorkspace(page, "materials");
  await expect(page.locator("#materials-workspace")).toBeVisible();
  await expect(page.getByLabel("Add Time node", { exact: true })).toBeVisible();
  await expect(page.locator("#viewport")).toBeVisible();
  assert.equal(await page.locator("[data-material-node]").count(), 2);
  const canvas = page.getByRole("application", {
    name: "Material node editor",
  });
  await expect(page.locator(".material-graph-layer")).not.toHaveAttribute(
    "style",
    /translate\(40px, 180px\) scale\(0\.75\)/,
  );
  const viewportTransform = await page
    .locator(".material-graph-layer")
    .getAttribute("style");
  await page.getByLabel("Add RGB Color node", { exact: true }).click();
  await expect(page.locator(".material-node.is-placing")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".material-node.is-placing")).toHaveCount(0);
  assert.equal(await page.locator("[data-material-node]").count(), 2);
  const physicalToggle = page.getByRole("button", {
    name: "+ Glass, thickness, coat & sheen",
    exact: true,
  });
  await physicalToggle.click();
  await expect(
    page.locator('[data-node-type="principled"] [data-input="thickness"]'),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "− Hide unused physical inputs", exact: true })
    .click();
  await expect(
    page.locator('[data-node-type="principled"] [data-input="thickness"]'),
  ).toHaveCount(0);
  await page.getByLabel("Add Value node", { exact: true }).click();
  const canvasBox = await canvas.boundingBox();
  await page.mouse.move(canvasBox.x + 150, canvasBox.y + 38, { steps: 5 });
  await page.mouse.click(canvasBox.x + 150, canvasBox.y + 38);
  await expect(page.locator(".material-node.is-placing")).toHaveCount(0);
  assert.equal(
    await page.locator(".material-graph-layer").getAttribute("style"),
    viewportTransform,
    "Placing a node does not reframe the graph",
  );
  const value = page.locator('[data-node-type="value"]');
  await value.getByLabel("Value value", { exact: true }).fill("0.35");
  const numberField = value.getByLabel("Value value", { exact: true });
  const numberBox = await numberField.boundingBox();
  await page.mouse.move(
    numberBox.x + numberBox.width / 2,
    numberBox.y + numberBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    numberBox.x + numberBox.width / 2 + 40,
    numberBox.y + numberBox.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(numberField).toHaveValue("0.45");
  await page.getByLabel("Undo material edit").click();
  await expect(numberField).toHaveValue("0.35");
  await page.mouse.move(
    numberBox.x + numberBox.width / 2,
    numberBox.y + numberBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    numberBox.x + numberBox.width / 2 + 40,
    numberBox.y + numberBox.height / 2,
    { steps: 8 },
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(numberField).toHaveValue("0.35");
  await page.getByLabel("Add Math node", { exact: true }).click();
  await page.mouse.move(canvasBox.x + 150, canvasBox.y + 220, { steps: 5 });
  await page.mouse.click(canvasBox.x + 150, canvasBox.y + 220);
  const math = page.locator('[data-node-type="math"]');
  const surface = page.locator('[data-node-type="principled"]');
  await math.getByLabel("Math operation").selectOption("ADD");
  await math.getByLabel("Math b", { exact: true }).fill("0.1");
  assert.deepEqual(
    await canvas.evaluate((element) => [element.scrollLeft, element.scrollTop]),
    [0, 0],
    "Editing fields cannot scroll the node canvas independently of graph coordinates",
  );
  await value.locator('[data-output="value"]').click();
  await math.locator('[data-input="a"]').click();
  await math.locator('[data-output="value"]').click();
  await surface.locator('[data-input="roughness"]').click();
  await expect(page.locator(".material-editor-status")).toContainText(
    "Live preview updated",
  );
  assert.equal(await page.locator("[data-material-wire]").count(), 3);
  await surface.locator('[data-output="shader"]').click();
  await math.locator('[data-input="b"]').click();
  await expect(page.locator(".material-editor-status")).toContainText(
    "Shader sockets",
  );
  assert.equal(await page.locator("[data-material-wire]").count(), 3);
  await page.getByLabel("Undo material edit").click();
  assert.equal(await page.locator("[data-material-wire]").count(), 2);
  await page.getByLabel("Redo material edit").click();
  assert.equal(await page.locator("[data-material-wire]").count(), 3);
  await math.getByLabel("Disconnect Math a").click();
  assert.equal(await page.locator("[data-material-wire]").count(), 2);
  await page.getByLabel("Undo material edit").click();
  assert.equal(await page.locator("[data-material-wire]").count(), 3);
  await math.getByLabel("Disconnect Math a").click();
  const sourceSocket = await value
    .locator('[data-output="value"]')
    .boundingBox();
  const inputSocket = await math.locator('[data-input="a"]').boundingBox();
  await page.mouse.move(
    sourceSocket.x + sourceSocket.width / 2 + 14,
    sourceSocket.y + sourceSocket.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    inputSocket.x + inputSocket.width / 2 - 17,
    inputSocket.y + inputSocket.height / 2,
    { steps: 10 },
  );
  await expect(page.locator("[data-pending-wire]")).toHaveCount(1);
  await expect(page.locator(".material-socket.is-snapped")).toHaveCount(1);
  assert.equal(
    await page.locator("[data-pending-wire]").evaluate((wire) => {
      const overlay = wire.closest("svg");
      return (
        Number(getComputedStyle(overlay).zIndex) > 0 &&
        getComputedStyle(wire).pointerEvents === "none"
      );
    }),
    true,
    "The active wire stays above node cards without blocking socket hits",
  );
  await page.mouse.move(
    inputSocket.x + inputSocket.width / 2 + 12,
    inputSocket.y + inputSocket.height / 2,
    { steps: 5 },
  );
  await expect(page.locator("[data-pending-wire].is-snapped")).toBeVisible();
  await page.mouse.move(
    inputSocket.x + inputSocket.width / 2,
    inputSocket.y + inputSocket.height / 2,
    { steps: 5 },
  );
  await expect(page.locator("[data-pending-wire].is-snapped")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator("[data-pending-wire]")).toHaveCount(0);
  assert.equal(await page.locator("[data-material-wire]").count(), 3);
  await page.mouse.move(
    inputSocket.x + inputSocket.width / 2,
    inputSocket.y + inputSocket.height / 2,
  );
  assert.equal(
    await page.locator("[data-material-wire]").count(),
    3,
    "Hovering a connected socket preserves its wire",
  );
  await page.mouse.down();
  await page.mouse.move(
    inputSocket.x + inputSocket.width / 2 - 45,
    inputSocket.y + inputSocket.height / 2,
    { steps: 5 },
  );
  await expect(page.locator("[data-pending-wire]")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(
    await page.locator("[data-material-wire]").count(),
    3,
    "Cancelling a rewire preserves its connection",
  );
  const header = await math.locator("header").boundingBox();
  const originalStyle = await math.getAttribute("style");
  const originalBox = await math.boundingBox();
  await value.locator("header").click();
  await math.locator("header").click();
  assert.equal(
    (await math.boundingBox()).height,
    originalBox.height,
    "Selecting a node does not resize its card",
  );
  await page.mouse.move(
    header.x + header.width / 2,
    header.y + header.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    header.x + header.width / 2 + 60,
    header.y + header.height / 2 + 25,
    { steps: 5 },
  );
  await page.mouse.up();
  assert.notEqual(await math.getAttribute("style"), originalStyle);
  const movedStyle = await math.getAttribute("style");
  const movedHeader = await math.locator("header").boundingBox();
  await page.mouse.move(
    movedHeader.x + movedHeader.width / 2,
    movedHeader.y + movedHeader.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    movedHeader.x + movedHeader.width / 2 + 42,
    movedHeader.y + movedHeader.height / 2 - 16,
    { steps: 6 },
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(
    await math.getAttribute("style"),
    movedStyle,
    "Escape restores the entire drag",
  );
  await page.mouse.move(
    movedHeader.x + movedHeader.width / 2,
    movedHeader.y + movedHeader.height / 2,
  );
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(
    movedHeader.x + movedHeader.width / 2 + 28,
    movedHeader.y + movedHeader.height / 2 - 15,
    { steps: 4 },
  );
  await page.mouse.up();
  await page.keyboard.up("Shift");
  assert.deepEqual(
    await math.evaluate((node) =>
      [parseFloat(node.style.left) % 20, parseFloat(node.style.top) % 20].map(
        (value) => Math.abs(value),
      ),
    ),
    [0, 0],
    "Shift-drag snaps the node to the grid",
  );
  await page.getByLabel("Undo material edit").click();
  assert.equal(
    await math.getAttribute("style"),
    movedStyle,
    "A whole drag is one undo checkpoint",
  );
  await canvas.focus();
  const beforePan = await page
    .locator(".material-graph-layer")
    .getAttribute("style");
  await page.keyboard.down("Space");
  await page.mouse.move(movedHeader.x + 20, movedHeader.y + 10);
  await page.mouse.down();
  await page.mouse.move(movedHeader.x + 60, movedHeader.y + 30, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const afterPan = await page
    .locator(".material-graph-layer")
    .getAttribute("style");
  assert.notEqual(afterPan, beforePan, "Space-drag pans even over a node");
  assert.equal(
    await math.getAttribute("style"),
    movedStyle,
    "Panning never moves a node",
  );
  await openWorkspace(page, "model");
  await openWorkspace(page, "materials");
  await expect(page.locator(".material-graph-layer")).toHaveAttribute(
    "style",
    afterPan,
  );
  await math.locator("header").click();
  await page.getByRole("application", { name: "Material node editor" }).focus();
  await page.keyboard.press("Shift+D");
  assert.equal(await page.locator('[data-node-type="math"]').count(), 2);
  await page.keyboard.press("Delete");
  assert.equal(await page.locator('[data-node-type="math"]').count(), 1);
  const graphFile = path.join(directory, "material.json");
  await app.evaluate(
    ({ BrowserWindow }, target) =>
      BrowserWindow.getAllWindows()[0].webContents.session.once(
        "will-download",
        (_event, item) => item.setSavePath(target),
      ),
    graphFile,
  );
  await page.getByRole("button", { name: "Save graph", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return (await readFile(graphFile)).length > 0;
      } catch {
        return false;
      }
    })
    .toBe(true);
  const saved = JSON.parse(await readFile(graphFile, "utf8"));
  assert.equal(compileMaterialGraph(saved).parameters[0].value, 0.35);
  const codeFile = path.join(directory, "material.ts");
  await app.evaluate(
    ({ BrowserWindow }, target) =>
      BrowserWindow.getAllWindows()[0].webContents.session.once(
        "will-download",
        (_event, item) => item.setSavePath(target),
      ),
    codeFile,
  );
  await page.getByRole("button", { name: "Export TSL", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return (await readFile(codeFile)).length > 0;
      } catch {
        return false;
      }
    })
    .toBe(true);
  assert.match(await readFile(codeFile, "utf8"), /TSL.uniform\(0.35\)/);
  await openWorkspace(page, "model");
  await openWorkspace(page, "materials");
  assert.equal(await page.locator('[data-node-type="math"]').count(), 1);
  await page
    .getByLabel("Import material graph", { exact: true })
    .setInputFiles(graphFile);
  await expect(page.locator(".material-editor-status")).toContainText(
    "Live preview updated",
  );
  const previewFile = path.join(directory, "preview.png");
  await app.evaluate(
    ({ BrowserWindow }, target) =>
      BrowserWindow.getAllWindows()[0].webContents.session.once(
        "will-download",
        (_event, item) => item.setSavePath(target),
      ),
    previewFile,
  );
  await page.locator("#screenshot").click();
  await expect
    .poll(async () => {
      try {
        return (await readFile(previewFile)).length > 0;
      } catch {
        return false;
      }
    })
    .toBe(true);
  const preview = await sharp(previewFile).stats();
  assert(
    preview.channels.some((channel) => channel.max - channel.min > 40),
    "WebGPU screenshots contain the rendered model, not an empty buffer",
  );
  let animatedGraph = createMaterialGraph("Time-driven noise");
  const clock = createMaterialNode("time"),
    animatedNoise = createMaterialNode("noise");
  animatedGraph.nodes.push(clock, animatedNoise);
  for (const [source, socket, target, input] of [
    [clock.id, "seconds", animatedNoise.id, "vector"],
    [clock.id, "delta", animatedGraph.nodes[0].id, "roughness"],
    [clock.id, "frame", animatedGraph.nodes[0].id, "clearcoat"],
    [animatedNoise.id, "color", animatedGraph.nodes[0].id, "color"],
  ])
    animatedGraph = connectMaterialNodes(
      animatedGraph,
      source,
      socket,
      target,
      input,
    );
  await writeFile(graphFile, JSON.stringify(animatedGraph));
  await page
    .getByLabel("Import material graph", { exact: true })
    .setInputFiles(graphFile);
  await expect(page.locator('[data-node-type="time"]')).toHaveCount(1);
  await expect(page.getByLabel("Time speed", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("Time offset", { exact: true })).toHaveValue(
    "0",
  );
  await expect(page.locator(".material-editor-status")).toContainText(
    "Live preview updated",
  );
  const animatedBefore = await page.locator("#viewport canvas").screenshot();
  await expect
    .poll(
      async () => {
        const animatedAfter = await page
          .locator("#viewport canvas")
          .screenshot();
        return !animatedBefore.equals(animatedAfter);
      },
      { message: "Time updates the rendered noise without editing the graph" },
    )
    .toBe(true);
  for (const type of [
    "noise",
    "fractal",
    "turbulence",
    "voronoi",
    "cell",
    "checker",
    "wave",
  ]) {
    let graph = createMaterialGraph(type);
    const procedural = createMaterialNode(type);
    graph.nodes.push(procedural);
    graph = connectMaterialNodes(
      graph,
      procedural.id,
      "color",
      graph.nodes[0].id,
      "color",
    );
    Object.assign(graph.nodes[0].inputs, {
      transmission: { value: 0.6 },
      thickness: { value: 0.5 },
      clearcoat: { value: 0.8 },
      sheen: { value: [0.1, 0.1, 0.1] },
    });
    await writeFile(graphFile, JSON.stringify(graph));
    await page
      .getByLabel("Import material graph", { exact: true })
      .setInputFiles(graphFile);
    await expect(page.locator(`[data-node-type="${type}"]`)).toHaveCount(1);
    await expect(page.locator(".material-editor-status")).toContainText(
      "Live preview updated",
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  const normalPreviews = {};
  for (const [type, operations] of Object.entries({
    mapping: ["POINT", "TEXTURE", "VECTOR", "NORMAL"],
    vectorMath: [
      "ADD",
      "SUBTRACT",
      "MULTIPLY",
      "DIVIDE",
      "SCALE",
      "CROSS_PRODUCT",
      "DOT_PRODUCT",
      "DISTANCE",
      "LENGTH",
      "NORMALIZE",
      "ABSOLUTE",
      "MINIMUM",
      "MAXIMUM",
      "FLOOR",
      "CEIL",
      "FRACTION",
      "SINE",
      "COSINE",
    ],
    mapRange: ["LINEAR", "STEPPED", "SMOOTHSTEP", "SMOOTHERSTEP"],
    bump: ["disabled", "enabled"],
    normalMap: ["disabled", "enabled"],
  })) {
    for (const operation of operations) {
      let graph = createMaterialGraph(`${type}-${operation}`);
      const node = createMaterialNode(type);
      if (["mapping", "vectorMath"].includes(type)) node.operation = operation;
      if (type === "mapRange") node.interpolation = operation;
      graph.nodes.push(node);
      if (["bump", "normalMap"].includes(type)) {
        node.inputs.strength = { value: operation === "disabled" ? 0 : 1 };
        if (type === "normalMap")
          node.inputs.color = { value: [0.8, 0.3, 0.9] };
      }
      if (type === "bump") {
        node.inputs.distance = { value: 0.1 };
        const noise = createMaterialNode("noise");
        graph.nodes.push(noise);
        graph = connectMaterialNodes(
          graph,
          noise.id,
          "factor",
          node.id,
          "height",
        );
      }
      graph = connectMaterialNodes(
        graph,
        node.id,
        materialOutputs(node)[0].name,
        graph.nodes[0].id,
        ["bump", "normalMap"].includes(type) ? "normal" : "color",
      );
      await writeFile(graphFile, JSON.stringify(graph));
      await page
        .getByLabel("Import material graph", { exact: true })
        .setInputFiles(graphFile);
      await expect(page.locator(`[data-node-type="${type}"]`)).toHaveCount(1);
      await expect(page.locator(".material-editor-status")).toContainText(
        "Live preview updated",
      );
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      if (["bump", "normalMap"].includes(type)) {
        const preview = page.locator("#viewport canvas");
        if (operation === "disabled")
          normalPreviews[type] = await preview.screenshot();
        else
          await expect
            .poll(
              async () =>
                (await preview.screenshot()).equals(normalPreviews[type]),
              { message: `${type} changes rendered surface lighting` },
            )
            .toBe(false);
      }
    }
  }
  if (process.env.BLENDER_FIXTURE) {
    await app.evaluate(
      ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
      process.env.BLENDER_FIXTURE,
    );
    await expect(page.locator("#filename")).toContainText("model.glb");
    await expect(
      page.getByText("Bridge Painted · TSL", { exact: true }),
    ).toBeAttached();
    await expect(
      page.getByText("Bridge Procedural · TSL", { exact: true }),
    ).toBeAttached();
    await expect(
      page.getByText("Bridge Unsupported · glTF fallback", { exact: true }),
    ).toBeAttached();
    const cameraSelect = page.getByLabel("Viewport camera", { exact: true });
    await expect(cameraSelect.locator("option")).toHaveCount(3);
    const orbitImage = await page.locator("#viewport canvas").screenshot();
    await cameraSelect.selectOption({ index: 1 });
    await expect(page.locator(".viewport-mode")).toContainText("Scene camera");
    const cameraImage = await page.locator("#viewport canvas").screenshot();
    assert.notDeepEqual(
      cameraImage,
      orbitImage,
      "Selecting a camera changes the rendered view",
    );
    await cameraSelect.selectOption({ index: 2 });
    await page
      .getByRole("button", { name: "Camera/light helpers", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Camera/light helpers", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const lights = page.getByRole("button", {
      name: "Scene lights (3)",
      exact: true,
    });
    const sceneLitImage = await page.locator("#viewport canvas").screenshot();
    await lights.click();
    await expect(lights).toHaveAttribute("aria-pressed", "false");
    const studioLitImage = await page.locator("#viewport canvas").screenshot();
    assert.notDeepEqual(
      sceneLitImage,
      studioLitImage,
      "Scene lighting changes the rendered model",
    );
    await lights.click();
    await page.locator("#reset").click();
    await expect(cameraSelect).toHaveValue("");
    const option = await page
      .getByLabel("Target material")
      .locator("option")
      .evaluateAll(
        (options) =>
          options.find((option) => option.textContent.includes("Painted"))
            ?.value,
      );
    await page.getByLabel("Target material").selectOption(option);
    await expect(page.locator('[data-node-type="image"]')).toHaveCount(1);
    await page.getByLabel("Arrange material nodes").click();
    await expect(page.locator(".material-editor-status")).toContainText(
      "Live preview updated",
    );
    await page
      .locator('[data-node-type="value"]')
      .getByLabel("Finish value", { exact: true })
      .fill("0.65");
    await expect(page.locator(".material-editor-status")).toContainText(
      "Live preview updated",
    );
  }
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: WebGPU material workspace, live TSL preview, node creation/wiring, type rejection, undo/redo, disconnect, dragging, duplicate/delete, graph/code downloads, import, and session drafts" +
      (process.env.BLENDER_FIXTURE
        ? "; actual Blender image/procedural graphs, camera selection, scene lighting, and helpers."
        : "."),
  );
} catch (error) {
  console.error(errors);
  if (app) {
    const page = await app.firstWindow();
    console.error(page.url());
    if (process.env.MATERIAL_EDITOR_DEBUG) {
      await page.screenshot({ path: "/tmp/glb-material-editor-failure.png" });
      console.error(
        await page.evaluate(() =>
          document.querySelector("[data-pending-wire]")?.getAttribute("d"),
        ),
      );
      console.error(
        await page.locator(".material-editor-status").textContent(),
      );
    }
  }
  throw error;
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
