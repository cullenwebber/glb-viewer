import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixture } from "./optimizer-test.mjs";
import { Optimizer } from "../electron/optimizer.mjs";
import { checkModel } from "../electron/pipeline/checks.mjs";
const directory = await mkdtemp(path.join(tmpdir(), "glb-check-fixes-"));
try {
  const { file, io, doc } = await fixture(directory);
  const mesh = doc.getRoot().listMeshes()[0],
    primitive = mesh.listPrimitives()[0];
  primitive.getMaterial().setDoubleSided(true);
  primitive.setAttribute(
    "TEXCOORD_1",
    primitive.getAttribute("TEXCOORD_0").clone(),
  );
  mesh.addPrimitive(primitive.clone());
  await writeFile(file, await io.writeBinary(doc));
  const source = await checkModel(file);
  assert.equal(
    source.issues.filter((row) => row.fix?.kind === "singleSided").length,
    2,
  );
  assert(source.issues.some((row) => row.fix?.kind === "cleanAttributes"));
  const engine = new Optimizer(),
    analysis = await engine.open(file);
  const fixes = source.issues
    .filter((row) => row.fix?.kind === "singleSided")
    .map((row) => ({ key: row.fix.key, primitive: row.fix.primitive }));
  const plan = {
    geometry: "none",
    textures: analysis.textures.map((row) => ({
      id: row.id,
      format: "keep",
      maxSize: 0,
    })),
    packs: [],
  };
  await engine.optimize({
    ...plan,
    optimization: { cleanAttributes: true, singleSided: [fixes[0]] },
  });
  let output = await io.readBinary(engine.output),
    primitives = output.getRoot().listMeshes()[0].listPrimitives();
  assert.equal(primitives[0].getMaterial().getDoubleSided(), false);
  assert.equal(
    primitives[1].getMaterial().getDoubleSided(),
    true,
    "shared material remains double-sided elsewhere",
  );
  assert(primitives.every((row) => !row.getAttribute("TEXCOORD_1")));
  assert(
    primitives.every((row) => row.getAttribute("TEXCOORD_0")),
    "required texture UVs survive",
  );
  await engine.optimize({
    ...plan,
    optimization: { cleanAttributes: true, singleSided: fixes },
  });
  const checked = await checkModel(file, engine.output);
  assert.equal(checked.errors, 0);
  assert(
    !checked.issues.some((row) => row.fix),
    "all listed fixes resolved in exported bytes",
  );
  assert(
    (await checkModel(file)).issues.some((row) => row.fix),
    "original is intact",
  );
  console.log(
    "PASS: actionable unused UV and single-sided fixes, shared material isolation, required UV preservation, output validation, original preservation.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
