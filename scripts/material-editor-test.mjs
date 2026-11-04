import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Texture } from "three";
import { scrubbedNumber, numericAttribute } from "../src/lib/number-scrub.ts";
import {
  createMaterialGraph,
  createMaterialNode,
  connectMaterialNodes,
  disconnectMaterialInput,
  removeMaterialNodes,
  parseMaterialGraph,
  arrangeMaterialGraph,
  nearestMaterialSocket,
  materialInputs,
  materialOutputs,
  materialSocketY,
  insertMaterialNode,
  findMaterialWireInsertion,
} from "../src/lib/material-editor.ts";
import {
  compileMaterialGraph,
  materialModule,
} from "../electron/pipeline/material-graph.mjs";

let graph = createMaterialGraph("Editable", { roughness: 0.4 });
assert.equal(scrubbedNumber(0.35, 0.1, 0.01, 0, 1), 0.45);
assert.equal(scrubbedNumber(0.35, 0.001, 0.01, 0, 1, true), 0.351);
assert.equal(scrubbedNumber(0.9, 10, 0.01, 0, 1), 1);
assert.equal(scrubbedNumber(0.1, -10, 0.01, 0, 1), 0);
assert.equal(scrubbedNumber(4, 0.3, 1, 0, 10, true), 4);
assert.equal(numericAttribute("any", 0.01), 0.01);
assert.equal(numericAttribute("", -Infinity), -Infinity);
const surface = graph.nodes[0],
  output = graph.nodes[1];
const value = createMaterialNode("value"),
  math = createMaterialNode("math"),
  color = createMaterialNode("rgb");
graph.nodes.push(value, math, color);
graph = connectMaterialNodes(graph, value.id, "value", math.id, "a");
graph = connectMaterialNodes(graph, math.id, "value", surface.id, "roughness");
graph = connectMaterialNodes(graph, color.id, "color", surface.id, "color");
assert.equal(compileMaterialGraph(graph).parameters.length, 1);
assert.throws(
  () => connectMaterialNodes(graph, math.id, "value", math.id, "b"),
  /cycle/,
);
assert.throws(
  () => connectMaterialNodes(graph, math.id, "value", value.id, "missing"),
  /supported/,
);
assert.throws(
  () => connectMaterialNodes(graph, color.id, "color", output.id, "surface"),
  /Shader/,
);
const second = createMaterialNode("math");
let chain = { ...graph, nodes: [...graph.nodes, second] };
chain = connectMaterialNodes(chain, math.id, "value", second.id, "a");
assert.throws(
  () => connectMaterialNodes(chain, second.id, "value", math.id, "b"),
  /cycle/,
);
assert.equal(
  disconnectMaterialInput(graph, surface.id, "roughness").nodes[0].inputs
    .roughness,
  undefined,
);
const removed = removeMaterialNodes(graph, [value.id]);
assert.equal(
  removed.nodes.find((node) => node.id === math.id).inputs.a,
  undefined,
);
assert.equal(removeMaterialNodes(graph, [output.id]).output, null);
assert.deepEqual(parseMaterialGraph(JSON.stringify(graph)), graph);
assert.throws(() => parseMaterialGraph({ ...graph, version: 2 }));
assert.throws(() =>
  parseMaterialGraph({ ...graph, nodes: [...graph.nodes, graph.nodes[0]] }),
);
const arranged = arrangeMaterialGraph(graph);
assert.equal(
  new Set(arranged.nodes.map((node) => node.position.join(","))).size,
  graph.nodes.length,
);
assert.doesNotThrow(() => compileMaterialGraph(arranged));
const proceduralTypes = [
  "noise",
  "fractal",
  "turbulence",
  "voronoi",
  "cell",
  "checker",
  "wave",
];
const snapGraph = createMaterialGraph("Snapping");
const snapValue = createMaterialNode("value", [-160, 0]);
snapGraph.nodes.push(snapValue);
const snapSurface = snapGraph.nodes[0];
assert.equal(materialInputs(snapSurface).length, 8);
assert.equal(materialInputs({ ...snapSurface, expanded: true }).length, 19);
const physicalLink = connectMaterialNodes(
  snapGraph,
  snapValue.id,
  "value",
  snapSurface.id,
  "thickness",
);
assert(
  materialInputs(physicalLink.nodes[0]).some(
    (input) => input.name === "thickness",
  ),
);
const nearColor = {
  x: snapSurface.position[0] - 20,
  y: -snapSurface.position[1] + materialSocketY(snapSurface, "color", "inputs"),
};
assert.equal(
  nearestMaterialSocket(snapGraph, nearColor, "inputs", 26, {
    node: snapValue.id,
    socket: "value",
  })?.socket,
  "color",
);
assert.equal(
  nearestMaterialSocket(snapGraph, nearColor, "inputs", 10, {
    node: snapValue.id,
    socket: "value",
  }),
  null,
);
assert.equal(
  nearestMaterialSocket(snapGraph, nearColor, "inputs", 26, {
    node: snapSurface.id,
    socket: "shader",
  }),
  null,
);
let previous = math;
for (const type of proceduralTypes) {
  const procedural = createMaterialNode(type),
    sum = createMaterialNode("math");
  sum.operation = "ADD";
  graph.nodes.push(procedural, sum);
  graph = connectMaterialNodes(graph, previous.id, "value", sum.id, "a");
  graph = connectMaterialNodes(graph, procedural.id, "factor", sum.id, "b");
  previous = sum;
}
graph = connectMaterialNodes(
  graph,
  previous.id,
  "value",
  surface.id,
  "roughness",
);
const physical = graph.nodes.find((node) => node.id === surface.id);
Object.assign(physical.inputs, {
  transmission: { value: 0.9 },
  thickness: { value: 0.5 },
  attenuationColor: { value: [0.2, 0.7, 0.9] },
  attenuationDistance: { value: 2 },
  clearcoat: { value: 1 },
  clearcoatRoughness: { value: 0.1 },
  sheen: { value: [0.5, 0.2, 0.1] },
  sheenRoughness: { value: 0.7 },
  diffuseRoughness: { value: 0.2 },
  specularIntensity: { value: 0.8 },
  specularColor: { value: [0.8, 0.9, 1] },
});
const proceduralPlan = compileMaterialGraph(graph);
for (const type of proceduralTypes)
  assert(proceduralPlan.steps.some((step) => step.op === type));
assert(proceduralPlan.outputs.transmission);
assert(proceduralPlan.outputs.thickness);
const screen = createMaterialNode("screen"),
  ramp = createMaterialNode("ramp");
ramp.interpolation = "ease";
ramp.stops.splice(1, 0, { position: 0.4, color: [1, 0, 0, 0.5] });
graph.nodes.push(screen, ramp);
graph = connectMaterialNodes(graph, screen.id, "x", ramp.id, "factor");
graph = connectMaterialNodes(graph, ramp.id, "color", surface.id, "color");
graph = connectMaterialNodes(graph, ramp.id, "alpha", surface.id, "alpha");
graph = connectMaterialNodes(
  graph,
  screen.id,
  "uv",
  graph.nodes.find((node) => node.type === "noise").id,
  "vector",
);
graph = connectMaterialNodes(
  graph,
  screen.id,
  "pixels",
  surface.id,
  "thickness",
);
graph = connectMaterialNodes(
  graph,
  screen.id,
  "resolution",
  surface.id,
  "attenuationColor",
);
graph = connectMaterialNodes(
  graph,
  screen.id,
  "y",
  surface.id,
  "sheenRoughness",
);
assert(
  compileMaterialGraph(graph).steps.some((step) => step.op === "rampFactor"),
);
for (const interpolation of ["linear", "constant", "ease"]) {
  const copy = structuredClone(graph);
  const nextRamp = copy.nodes.find((node) => node.id === ramp.id);
  nextRamp.interpolation = interpolation;
  nextRamp.stops[1].position = 0;
  assert.doesNotThrow(() => compileMaterialGraph(copy));
}
const invalidRamp = structuredClone(graph);
invalidRamp.nodes.find((node) => node.id === ramp.id).stops = [];
assert.throws(() => compileMaterialGraph(invalidRamp), /Color Ramp/);
let insertion = createMaterialGraph("Insert");
insertion.nodes[0].position = [650, 0];
insertion.nodes[1].position = [1000, 0];
const insertSource = createMaterialNode("rgb", [0, 0]),
  insertMix = createMaterialNode("mix", [340, 0]);
insertion.nodes.push(insertSource, insertMix);
insertion = connectMaterialNodes(
  insertion,
  insertSource.id,
  "color",
  insertion.nodes[0].id,
  "color",
);
assert.deepEqual(findMaterialWireInsertion(insertion, insertMix.id), {
  node: insertion.nodes[0].id,
  input: "color",
});
insertion = insertMaterialNode(
  insertion,
  insertMix.id,
  insertion.nodes[0].id,
  "color",
);
assert.equal(insertion.nodes[0].inputs.color.link.node, insertMix.id);
assert.equal(
  insertion.nodes.find((node) => node.id === insertMix.id).inputs.a.link.node,
  insertSource.id,
);
assert.doesNotThrow(() => compileMaterialGraph(insertion));
assert.throws(() =>
  insertMaterialNode(
    insertion,
    insertSource.id,
    insertion.nodes[0].id,
    "color",
  ),
);
const utilityGraphs = [];
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
  bump: ["default", "invert"],
  normalMap: ["default"],
})) {
  for (const operation of operations) {
    let utilityGraph = createMaterialGraph(`${type}-${operation}`);
    const utility = createMaterialNode(type);
    if (type === "mapRange") utility.interpolation = operation;
    else if (["mapping", "vectorMath"].includes(type))
      utility.operation = operation;
    if (operation === "invert") utility.invert = true;
    utilityGraph.nodes.push(utility);
    const port = materialOutputs(utility)[0].name;
    utilityGraph = connectMaterialNodes(
      utilityGraph,
      utility.id,
      port,
      utilityGraph.nodes[0].id,
      ["bump", "normalMap"].includes(type) ? "normal" : "color",
    );
    assert.doesNotThrow(() => compileMaterialGraph(utilityGraph));
    const invalid = structuredClone(utilityGraph);
    const invalidUtility = invalid.nodes.find((node) => node.id === utility.id);
    if (type === "mapRange") invalidUtility.interpolation = "INVALID";
    else if (["mapping", "vectorMath"].includes(type))
      invalidUtility.operation = "INVALID";
    if (["mapping", "vectorMath", "mapRange"].includes(type))
      assert.throws(() => compileMaterialGraph(invalid), /Unsupported/);
    utilityGraphs.push(utilityGraph);
  }
}
const mapping = createMaterialNode("mapping"),
  vectorMath = createMaterialNode("vectorMath"),
  mapRange = createMaterialNode("mapRange"),
  bump = createMaterialNode("bump"),
  normalMap = createMaterialNode("normalMap");
graph.nodes.push(mapping, vectorMath, mapRange, bump, normalMap);
graph = connectMaterialNodes(graph, screen.id, "uv", mapping.id, "vector");
graph = connectMaterialNodes(graph, mapping.id, "vector", vectorMath.id, "a");
graph = connectMaterialNodes(
  graph,
  vectorMath.id,
  "vector",
  graph.nodes.find((node) => node.type === "noise").id,
  "vector",
);
graph = connectMaterialNodes(graph, previous.id, "value", mapRange.id, "value");
graph = connectMaterialNodes(
  graph,
  mapRange.id,
  "value",
  surface.id,
  "roughness",
);
graph = connectMaterialNodes(
  graph,
  graph.nodes.find((node) => node.type === "noise").id,
  "factor",
  bump.id,
  "height",
);
graph = connectMaterialNodes(graph, normalMap.id, "normal", bump.id, "normal");
graph = connectMaterialNodes(graph, bump.id, "normal", surface.id, "normal");
assert(compileMaterialGraph(graph).outputs.normal);
const directory = path.resolve(".material-editor-test-" + Date.now());
let timeGraph = createMaterialGraph("Animated");
const timeNode = createMaterialNode("time");
timeNode.inputs.speed.value = -2;
timeNode.inputs.offset.value = 4;
timeGraph.nodes.push(timeNode);
for (const [socket, target] of [
  ["seconds", "roughness"],
  ["delta", "thickness"],
  ["frame", "clearcoat"],
]) {
  timeGraph = connectMaterialNodes(
    timeGraph,
    timeNode.id,
    socket,
    timeGraph.nodes[0].id,
    target,
  );
}
assert.deepEqual(parseMaterialGraph(JSON.stringify(timeGraph)), timeGraph);
const timePlan = compileMaterialGraph(timeGraph);
for (const socket of ["seconds", "delta", "frame"]) {
  assert(
    timePlan.steps.some(
      (step) => step.op === `time_${socket}` && step.kind === "float",
    ),
  );
}
const clockStep = timePlan.steps.find((step) => step.op === "time_seconds");
assert.deepEqual(
  clockStep.args.map(
    (id) => timePlan.steps.find((step) => step.id === id).value,
  ),
  [-2, 4],
);
assert.throws(
  () =>
    compileMaterialGraph({
      ...timeGraph,
      nodes: timeGraph.nodes.map((node) =>
        node.type === "principled"
          ? {
              ...node,
              inputs: {
                ...node.inputs,
                roughness: { link: { node: timeNode.id, socket: "missing" } },
              },
            }
          : node,
      ),
    }),
  /unsupported/i,
);
utilityGraphs.push(timeGraph);
await mkdir(directory);
try {
  const file = path.join(directory, "material.ts");
  await writeFile(file, materialModule(graph));
  const ktxGraph = createMaterialGraph("Compressed"),
    image = createMaterialNode("image");
  image.image = "data:image/ktx2;base64,AAAA";
  ktxGraph.nodes.push(image);
  const compressedGraph = connectMaterialNodes(
    ktxGraph,
    image.id,
    "color",
    ktxGraph.nodes[0].id,
    "color",
  );
  const compressedFile = path.join(directory, "compressed.ts");
  await writeFile(compressedFile, materialModule(compressedGraph));
  const utilityFiles = [];
  for (const [index, utilityGraph] of utilityGraphs.entries()) {
    const utilityFile = path.join(directory, `utility-${index}.ts`);
    await writeFile(utilityFile, materialModule(utilityGraph));
    utilityFiles.push(utilityFile);
  }
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
      file,
      compressedFile,
      ...utilityFiles,
    ],
    { stdio: "pipe" },
  );
  const { createMaterial } = await import(pathToFileURL(file).href);
  const asset = await createMaterial();
  assert(asset.material.isMeshPhysicalNodeMaterial);
  assert(asset.material.transmissionNode);
  assert(asset.material.thicknessNode);
  assert(asset.material.clearcoatNode);
  assert(asset.material.sheenNode);
  assert(asset.material.normalNode);
  assert.equal(Object.keys(asset.parameters).length, 1);
  asset.dispose();
  for (const utilityFile of utilityFiles) {
    const utilityModule = await import(pathToFileURL(utilityFile).href);
    const utilityAsset = await utilityModule.createMaterial();
    assert(utilityAsset.material.isMeshPhysicalNodeMaterial);
    utilityAsset.dispose();
  }
  const compressed = await import(pathToFileURL(compressedFile).href);
  await assert.rejects(compressed.createMaterial(), /KTX2/);
  let textureDisposed = false;
  const compressedAsset = await compressed.createMaterial({
    loadKTX2: async (url) => {
      assert.equal(url, image.image);
      const texture = new Texture();
      texture.addEventListener("dispose", () => (textureDisposed = true));
      return texture;
    },
  });
  compressedAsset.dispose();
  assert(textureDisposed);
} catch (error) {
  throw new Error(error.stdout?.toString() || error.stack);
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log(
  "PASS: node creation, typed socket connections, cycle prevention, disconnection/deletion, graph round trips, layout, and strict runnable TSL module export.",
);
