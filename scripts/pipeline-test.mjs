import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fixture } from "./optimizer-test.mjs";
import { Optimizer } from "../electron/optimizer.mjs";
import { checkModel } from "../electron/pipeline/checks.mjs";
const require = createRequire(import.meta.url),
  { createLibrary } = require("../electron/pipeline/library.cjs"),
  { ModelWatcher } = require("../electron/pipeline/file-watcher.cjs"),
  { exportBundle } = require("../electron/pipeline/export-bundle.cjs");
const directory = await mkdtemp(path.join(tmpdir(), "glb-pipeline-"));
try {
  const { file, io, doc } = await fixture(directory),
    engine = new Optimizer(),
    analysis = await engine.open(file);
  const checked = await checkModel(file);
  assert.equal(checked.errors, 0);
  assert(checked.validatorVersion);
  const textures = analysis.textures.map((texture) => ({
    id: texture.id,
    format: "keep",
    maxSize: 0,
  }));
  const optimized = await engine.optimize({
    geometry: "meshopt",
    textures,
    packs: [],
    optimization: {
      ratio: 0.5,
      error: 0.2,
      lods: [0.5, 0.25],
      dedup: true,
      prune: true,
    },
  });
  assert(
    optimized.afterMeshes[0].triangles < optimized.beforeMeshes[0].triangles,
  );
  assert.equal(engine.lods.length, 2);
  for (const lod of engine.lods) {
    const loaded = await io.readBinary(lod.bytes);
    assert(loaded.getRoot().listMeshes().length);
    assert(lod.meshes[0].triangles <= optimized.afterMeshes[0].triangles);
  }
  const bundle = await exportBundle(
    directory,
    "fixture.glb",
    { bytes: engine.output, lods: engine.lods, report: engine.report },
    path.resolve("dist/decoders"),
  );
  for (const name of [
    "model.glb",
    "model-lod1.glb",
    "model-lod2.glb",
    "load-model.ts",
    "assets.json",
    "optimization-report.json",
    "package.fragment.json",
    "decoders/draco/draco_decoder.wasm",
    "decoders/basis/basis_transcoder.wasm",
  ])
    assert((await readFile(path.join(bundle, name))).byteLength > 0);
  const metadata = JSON.parse(
    await readFile(path.join(bundle, "assets.json"), "utf8"),
  );
  assert.equal(metadata.lods.length, 2);
  assert.equal(metadata.threeVersion, "0.187.0");
  const protectedReport = await engine.optimize({
    geometry: "none",
    textures,
    packs: [],
    optimization: {
      ratio: 0.2,
      error: 0.2,
      meshes: [{ key: analysis.meshes[0].key, protected: true }],
    },
  });
  assert.equal(
    protectedReport.afterMeshes[0].triangles,
    analysis.meshes[0].triangles,
  );
  const node = doc.getRoot().listNodes()[0],
    mesh = node.getMesh();
  for (let i = 0; i < 4; i++)
    doc
      .getRoot()
      .listScenes()[0]
      .addChild(
        doc
          .createNode("Duplicate " + i)
          .setMesh(mesh)
          .setTranslation([i + 2, 0, 0]),
      );
  const repeated = path.join(directory, "repeated.glb");
  await writeFile(repeated, await io.writeBinary(doc));
  const repeatedEngine = new Optimizer();
  const repeatedAnalysis = await repeatedEngine.open(repeated);
  await repeatedEngine.optimize({
    geometry: "none",
    textures: repeatedAnalysis.textures.map((texture) => ({
      id: texture.id,
      format: "keep",
      maxSize: 0,
    })),
    packs: [],
    optimization: { instance: true, dedup: true, preserveNamed: false },
  });
  assert(
    repeatedEngine.resultDoc
      .getRoot()
      .listExtensionsUsed()
      .some(
        (extension) => extension.extensionName === "EXT_mesh_gpu_instancing",
      ),
  );
  const buffer = doc.getRoot().listBuffers()[0],
    times = doc
      .createAccessor()
      .setBuffer(buffer)
      .setType("SCALAR")
      .setArray(new Float32Array([0, 0.5, 1])),
    values = doc
      .createAccessor()
      .setBuffer(buffer)
      .setType("VEC3")
      .setArray(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const sampler = doc
    .createAnimationSampler()
    .setInput(times)
    .setOutput(values)
    .setInterpolation("LINEAR");
  const channel = doc
    .createAnimationChannel()
    .setTargetNode(node)
    .setTargetPath("translation")
    .setSampler(sampler);
  doc.createAnimation("Idle").addChannel(channel);
  const animated = path.join(directory, "animated.glb");
  await writeFile(animated, await io.writeBinary(doc));
  const animatedEngine = new Optimizer();
  const animatedAnalysis = await animatedEngine.open(animated);
  const animatedReport = await animatedEngine.optimize({
    geometry: "none",
    textures: animatedAnalysis.textures.map((texture) => ({
      id: texture.id,
      format: "keep",
      maxSize: 0,
    })),
    packs: [],
    optimization: { resample: true, instance: true },
  });
  assert(
    animatedReport.warnings.some((message) => message.includes("animations")),
  );
  assert.equal(
    animatedEngine.resultDoc.getRoot().listAnimations()[0].getName(),
    "Idle",
  );
  const recipe = {
      version: 1,
      geometry: "meshopt",
      geometryOptions: {},
      optimization: { preserveNamed: true },
      textureRules: [],
      packs: [],
    },
    library = createLibrary(path.join(directory, "library"));
  const saved = await library.save({ name: "Web", recipe });
  await Promise.all([
    library.saveRecipe("a".repeat(32), recipe),
    library.save({ name: "Mobile", recipe }),
  ]);
  assert.equal(
    (await createLibrary(path.join(directory, "library")).list()).length,
    2,
  );
  assert.equal((await library.getRecipe("a".repeat(32))).geometry, "meshopt");
  await library.save({ id: saved.id, name: "Web renamed", recipe });
  assert((await library.list()).some((row) => row.name === "Web renamed"));
  await library.delete(saved.id);
  assert.equal((await library.list()).length, 1);
  const watchFile = path.join(directory, "watched.glb");
  await writeFile(watchFile, await readFile(file));
  let timer;
  const changed = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("File watch timed out")), 10000);
    const watcher = new ModelWatcher(() => {
      watcher.stop();
      resolve();
    }, reject);
    watcher
      .start(watchFile)
      .then(async () => {
        // Deliberately suppress native events to exercise the missed-event fallback.
        watcher.watcher.close();
        watcher.watcher = null;
        await writeFile(
          path.join(directory, "replacement.glb"),
          await readFile(repeated),
        );
        const { rename } = await import("node:fs/promises");
        await rename(path.join(directory, "replacement.glb"), watchFile);
      })
      .catch(reject);
  });
  await changed;
  clearTimeout(timer);
  const outside = path.join(directory, "outside.bin");
  await writeFile(outside, new Uint8Array(32));
  const inner = path.join(directory, "inner");
  await mkdir(inner);
  const escaped = path.join(inner, "escaped.gltf");
  await writeFile(
    escaped,
    JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ uri: "../outside.bin", byteLength: 32 }],
    }),
  );
  const invalid = await checkModel(escaped);
  assert(invalid.errors > 0);
  console.log(
    "PASS: glTF validation, scoped external reads, simplification, protected meshes, LOD round trips, instancing, animation cleanup, complete Three.js bundles, persistent preset/recipe storage, and atomic Blender file watching.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
