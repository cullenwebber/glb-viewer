import assert from "node:assert/strict";
import { createRecipe, applyRecipe } from "../src/lib/recipes.ts";
const image = (id, name, slot) => ({
  id,
  name,
  uri: name + ".png",
  slots: [slot],
  uses: ["Paint"],
  mime: "image/png",
  editable: true,
});
const analysis = {
  name: "model.glb",
  beforeBytes: 100,
  sourceFiles: 1,
  animations: [],
  meshes: [{ id: 0, key: "mesh-key", name: "Body" }],
  textures: [
    image(0, "diffuse", "baseColorTexture"),
    image(1, "normal", "normalTexture"),
    image(2, "roughness", "metallicRoughnessTexture"),
  ],
  materials: [{ id: 0, name: "Paint" }],
};
const recipe = createRecipe(analysis, {
  geometry: "meshopt",
  geometryOptions: {},
  optimization: { meshes: [{ key: "mesh-key", protected: true }] },
  textures: [
    { id: 0, maxSize: 4096, format: "etc1s", compression: { quality: 180 } },
    { id: 1, maxSize: 2048, format: "uastc" },
    { id: 2, maxSize: 1024, format: "png" },
  ],
  packs: [
    {
      name: "ORM",
      material: 0,
      target: "orm",
      size: 1024,
      format: "png",
      channels: [
        { texture: 2, channel: 0, value: 255 },
        { texture: 2, channel: 1, value: 255 },
        { texture: 2, channel: 2, value: 255 },
        { texture: null, channel: 3, value: 255 },
      ],
    },
  ],
});
const reordered = {
  ...analysis,
  textures: [
    { ...analysis.textures[2], id: 0 },
    { ...analysis.textures[0], id: 1 },
    { ...analysis.textures[1], id: 2 },
  ],
  materials: [
    { id: 0, name: "Other" },
    { id: 1, name: "Paint" },
  ],
};
const result = applyRecipe(reordered, recipe);
assert.equal(result.warnings.length, 0);
assert.equal(result.plan.textures.find((row) => row.id === 1).maxSize, 4096);
assert.equal(result.plan.textures.find((row) => row.id === 0).maxSize, 1024);
assert.equal(result.plan.packs[0].material, 1);
assert.equal(result.plan.packs[0].channels[0].texture, 0);
const otherModel = {
  ...analysis,
  textures: analysis.textures.map((texture, id) => ({
    ...texture,
    name: "other-" + id,
    uri: "other-" + id + ".png",
    uses: ["Other material"],
  })),
};
const roleMatched = applyRecipe(otherModel, { ...recipe, packs: [] });
assert.equal(roleMatched.plan.textures[0].maxSize, 4096);
assert.equal(roleMatched.plan.textures[2].maxSize, 1024);
const ambiguous = structuredClone(recipe);
ambiguous.textureRules.push({
  ...ambiguous.textureRules[0],
  identity: "another-diffuse",
  settings: { maxSize: 512, format: "webp" },
});
const skipped = applyRecipe(otherModel, ambiguous);
assert(skipped.warnings.some((message) => message.includes("ambiguous")));
assert.equal(skipped.plan.textures[0].format, "keep");
assert(skipped.warnings.some((message) => message.includes("Skipped ORM")));
const missingMesh = applyRecipe({ ...analysis, meshes: [] }, recipe);
assert.equal(missingMesh.plan.optimization.meshes.length, 0);
assert(
  missingMesh.warnings.some((message) => message.includes("mesh overrides")),
);
console.log(
  "PASS: preset remapping across image/material reorder, cross-model role rules, safe ambiguous/missing-reference handling, and stable mesh protections.",
);
