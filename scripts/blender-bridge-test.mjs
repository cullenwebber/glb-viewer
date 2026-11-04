import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  compileMaterialGraph,
  BRIDGE_KEY,
} from "../electron/pipeline/material-graph.mjs";
import { Optimizer } from "../electron/optimizer.mjs";
import sharp from "sharp";

const blender =
  process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
try {
  await access(blender);
} catch {
  console.log(
    "SKIP: Blender integration (set BLENDER to its executable path).",
  );
  process.exit(0);
}
const directory = await mkdtemp(path.join(tmpdir(), "glb-blender-"));
try {
  execFileSync(
    blender,
    [
      "--background",
      "--factory-startup",
      "--python-exit-code",
      "1",
      "--python",
      "scripts/blender-bridge-fixture.py",
      "--",
      directory,
    ],
    { stdio: "pipe", timeout: 120000 },
  );
  const bytes = await readFile(path.join(directory, "model.glb"));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const expected = JSON.parse(
    await readFile(path.join(directory, "expected.json"), "utf8"),
  );
  const graphs = json.materials.map((material) =>
    JSON.parse(material.extras[BRIDGE_KEY]),
  );
  const translated = compileMaterialGraph(
    graphs.find((graph) => graph.id === expected.id),
  );
  assert(translated.steps.some((step) => step.op === "image"));
  assert(translated.steps.some((step) => step.op === "mix"));
  for (const operation of [
    "mapping_POINT",
    "vector_SCALE",
    "map_LINEAR",
    "normalMap",
  ])
    assert(
      translated.steps.some((step) => step.op === operation),
      operation,
    );
  assert(translated.outputs.normal);
  const image = translated.steps.find((step) => step.op === "image");
  const pixels = await sharp(Buffer.from(image.image.split(",")[1], "base64"))
    .ensureAlpha()
    .raw()
    .toBuffer();
  const colors = new Set(
    Array.from({ length: 4 }, (_, index) =>
      [...pixels.subarray(index * 4, index * 4 + 3)].join(","),
    ),
  );
  assert.deepEqual(
    colors,
    new Set(["255,0,0", "0,255,0", "0,0,255", "255,255,255"]),
  );
  assert.equal(translated.parameters[0].label, "Finish");
  const procedural = compileMaterialGraph(
    graphs.find((graph) => graph.name === "Bridge Procedural"),
  );
  assert(procedural.steps.some((step) => step.op === "fractal"));
  assert(procedural.steps.some((step) => step.op === "bump"));
  assert(procedural.outputs.normal);
  assert(procedural.outputs.transmission);
  assert(procedural.outputs.clearcoat);
  assert.throws(
    () =>
      compileMaterialGraph(
        graphs.find((graph) => graph.name === "Bridge Unsupported"),
      ),
    /Only 3D fBM/,
  );
  assert.equal(json.cameras.length, 2);
  assert(json.cameras.some((camera) => camera.type === "orthographic"));
  assert.deepEqual(
    new Set(
      json.extensions.KHR_lights_punctual.lights.map((light) => light.type),
    ),
    new Set(["point", "spot", "directional"]),
  );
  const optimizer = new Optimizer();
  const analysis = await optimizer.open(path.join(directory, "model.glb"));
  await optimizer.optimize({
    geometry: "meshopt",
    textures: analysis.textures.map((texture) => ({
      id: texture.id,
      format: "keep",
      maxSize: 0,
    })),
    packs: [],
  });
  const output = Buffer.from(optimizer.output);
  const optimized = JSON.parse(
    output.subarray(20, 20 + output.readUInt32LE(12)),
  );
  assert.equal(optimized.cameras.length, 2);
  assert.equal(optimized.extensions.KHR_lights_punctual.lights.length, 3);
  assert(
    optimized.materials.some(
      (material) => JSON.parse(material.extras[BRIDGE_KEY]).id === expected.id,
    ),
  );
  if (process.env.BLENDER_UI_TEST)
    execFileSync(process.execPath, ["scripts/material-editor-ui-test.mjs"], {
      stdio: "inherit",
      env: {
        ...process.env,
        BLENDER_FIXTURE: path.join(directory, "model.glb"),
      },
      timeout: 120000,
    });
  console.log(
    "PASS: actual Blender image/procedural/physical material export, perspective and orthographic cameras, punctual lights, and preservation through Meshopt optimization.",
  );
} catch (error) {
  console.error(error.stdout?.toString() || "", error.stderr?.toString() || "");
  throw error;
} finally {
  if (process.env.KEEP_BLENDER_FIXTURE)
    console.log("Blender fixture: " + directory);
  else await rm(directory, { recursive: true, force: true });
}
