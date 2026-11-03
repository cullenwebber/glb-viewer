import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { fixture } from "./optimizer-test.mjs";
import { Optimizer } from "../electron/optimizer.mjs";
import {
  discoverModels,
  runBatch,
  batchPlan,
} from "../electron/pipeline/batch.mjs";
import { MaterialInspection } from "../src/viewer/material-inspection.ts";
import { defaultDisplay } from "../src/viewer/types.ts";
import * as THREE from "three";
const require = createRequire(import.meta.url),
  { createHistory } = require("../electron/pipeline/history.cjs"),
  {
    createBudgets,
    budgetResults,
  } = require("../electron/pipeline/budgets.cjs"),
  { newer, createUpdates } = require("../electron/pipeline/updates.cjs"),
  { exportBundle } = require("../electron/pipeline/export-bundle.cjs");
const directory = await mkdtemp(path.join(tmpdir(), "glb-studio-"));
try {
  const input = path.join(directory, "inputs");
  await mkdir(input);
  const { file, io } = await fixture(input),
    engine = new Optimizer(),
    analysis = await engine.open(file);
  const plan = {
    geometry: "meshopt",
    textures: analysis.textures.map((t) => ({
      id: t.id,
      format: "keep",
      maxSize: 0,
    })),
    packs: [],
  };
  const report = await engine.optimize(plan),
    recipe = {
      version: 1,
      geometry: "meshopt",
      geometryOptions: {},
      optimization: {},
      textureRules: [],
      packs: [],
    };
  const history = createHistory(directory),
    run = await history.save("a".repeat(32), "First run", recipe, {
      bytes: engine.output,
      report,
      lods: [],
    });
  assert.equal((await createHistory(directory).list("a".repeat(32))).length, 1);
  await history.rename(run.id, "Web final");
  const restored = await history.get(run.id);
  assert.equal(restored.name, "Web final");
  assert.equal(restored.bytes.byteLength, report.afterBytes);
  assert((await io.readBinary(restored.bytes)).getRoot().listMeshes().length);
  const budgets = createBudgets(directory),
    budget = await budgets.save({
      name: "Small web",
      fileBytes: 1,
      triangles: 1,
      drawCalls: 1,
      textureBytes: 1,
    });
  assert.equal((await createBudgets(directory).list()).length, 1);
  assert(
    budgetResults(budget, { fileBytes: 10 }).find((r) => r.key === "fileBytes")
      .exceeded,
  );
  await writeFile(path.join(input, "invalid.gltf"), "{broken}");
  const jobs = await discoverModels(input);
  assert.equal(jobs.length, 2);
  const output = path.join(directory, "batch");
  await mkdir(output);
  const batch = await runBatch({ jobs, output, recipe, budget });
  assert.equal(batch.rows.filter((row) => row.status === "complete").length, 1);
  assert.equal(batch.rows.filter((row) => row.status === "failed").length, 1);
  assert(
    batch.rows
      .find((row) => row.status === "complete")
      .budgets.some((row) => row.exceeded),
  );
  assert((await readFile(path.join(output, "batch-report.json"))).length);
  const mapped = batchPlan(analysis, {
    ...recipe,
    textureRules: [
      {
        identity: "other",
        slots: ["baseColorTexture"],
        settings: { format: "webp", maxSize: 32 },
      },
    ],
  });
  assert.equal(mapped.plan.textures.length, analysis.textures.length);
  const bundle = await exportBundle(
    directory,
    "model.glb",
    { bytes: engine.output, report, lods: [] },
    path.resolve("dist/decoders"),
  );
  // Place generated files beside the project's node_modules for real strict TypeScript checking.
  const generated = path.join(process.cwd(), ".handoff-test-" + Date.now());
  await mkdir(generated);
  try {
    for (const name of ["load-model.ts", "model-types.ts", "Model.tsx"])
      await writeFile(
        path.join(generated, name),
        await readFile(path.join(bundle, name)),
      );
    execFileSync(
      path.resolve("node_modules/.bin/tsc"),
      [
        "--ignoreConfig",
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--module",
        "ESNext",
        "--target",
        "ES2022",
        "--moduleResolution",
        "Bundler",
        "--jsx",
        "react-jsx",
        ...["load-model.ts", "model-types.ts", "Model.tsx"].map((name) =>
          path.join(generated, name),
        ),
      ],
      { stdio: "pipe" },
    );
  } catch (e) {
    throw new Error(e.stdout?.toString() || e.message);
  } finally {
    await rm(generated, { recursive: true, force: true });
  }
  const root = new THREE.Group(),
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.8 }),
    );
  root.add(mesh);
  const original = mesh.material,
    inspection = new MaterialInspection();
  for (const mode of [
    "baseColor",
    "roughness",
    "metalness",
    "normals",
    "normalMap",
    "ao",
    "alpha",
    "orientation",
    "cost",
    "weights",
  ]) {
    inspection.apply(root, { ...defaultDisplay, inspection: mode });
    assert.notEqual(mesh.material, original);
    inspection.restore();
    assert.equal(mesh.material, original);
  }
  const uv = inspection.uv(root, undefined, 0);
  assert(uv.sets.includes(0));
  assert.equal(uv.segments.length, 36 * 4);
  inspection.restore();
  assert(newer("v1.2.0", "1.1.0"));
  assert(!newer("v1.1.0-beta", "1.1.0"));
  assert(!newer("v1.0.0", "1.1.0"));
  const updater = new EventEmitter();
  updater.downloadUpdate = async () => updater.emit("update-downloaded");
  updater.checkForUpdates = async () => ({});
  let opened = "",
    installed = false;
  updater.quitAndInstall = () => (installed = true);
  const options = {
    app: { getVersion: () => "1.1.0" },
    autoUpdater: updater,
    shell: { openExternal: async (url) => (opened = url) },
    fetch: async () => ({
      ok: true,
      json: async () => ({ tag_name: "v1.2.0" }),
    }),
    send: () => {},
    signed: false,
  };
  const manual = createUpdates(options);
  assert.equal((await manual.check()).status, "available");
  await manual.download();
  assert.match(
    opened,
    /github.com\/cullenwebber\/glb-viewer\/releases\/tag\/v1.2.0$/,
  );
  assert.throws(() => manual.install());
  const automatic = createUpdates({ ...options, signed: true });
  await automatic.check();
  await automatic.download();
  assert.equal(automatic.state().status, "ready");
  automatic.install();
  assert(installed);
  const offline = createUpdates({
    ...options,
    fetch: async () => {
      throw new Error("Offline");
    },
  });
  assert.equal((await offline.check()).status, "error");
  await history.delete(run.id);
  assert.equal((await history.list("a".repeat(32))).length, 0);
  console.log(
    "PASS: history persistence/restoration, budget thresholds, mixed-success batch validation, typed Three.js/R3F handoffs, inspection material restoration/UVs, and signed/manual/offline updates.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
