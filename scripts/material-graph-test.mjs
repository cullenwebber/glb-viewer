import assert from "node:assert/strict";
import * as THREE from "three";
import {
  BRIDGE_KEY,
  compileMaterialGraph,
} from "../electron/pipeline/material-graph.mjs";
import { applyBridgeMaterials } from "../electron/pipeline/material-runtime.mjs";

export function graphFixture() {
  return {
    version: 1,
    id: "test-material",
    name: "Test material",
    output: "output",
    nodes: [
      {
        id: "output",
        type: "output",
        inputs: { surface: { link: { node: "surface", socket: "shader" } } },
      },
      {
        id: "surface",
        type: "principled",
        inputs: { roughness: { link: { node: "math", socket: "value" } } },
      },
      {
        id: "math",
        label: "Roughness",
        type: "math",
        operation: "ADD",
        inputs: {
          a: { link: { node: "value", socket: "value" } },
          b: { value: 0.1 },
        },
      },
      { id: "value", label: "Finish", type: "value", value: 0.25 },
      { id: "unused", type: "unsupported", label: "Disconnected noise" },
    ],
  };
}
const graph = graphFixture();
const plan = compileMaterialGraph(JSON.stringify(graph));
assert.equal(plan.parameters.length, 1);
assert.equal(plan.parameters[0].value, 0.25);
assert.equal(plan.nodes.find((node) => node.id === "unused").connected, false);
assert(plan.steps.some((node) => node.op === "add"));
for (const mutate of [
  (copy) => {
    copy.version = 99;
  },
  (copy) => {
    copy.nodes.push(copy.nodes[0]);
  },
  (copy) => {
    copy.nodes[2].operation = "EXECUTE";
  },
  (copy) => {
    copy.nodes[2].inputs.a.link.node = "missing";
  },
  (copy) => {
    copy.nodes[2].inputs.a.link.node = "math";
  },
  (copy) => {
    copy.nodes[3].value = NaN;
  },
  (copy) => {
    copy.nodes[0].errors = ["Volume is unsupported"];
  },
  (copy) => {
    copy.nodes[1].errors = ["Normal is unsupported"];
  },
  (copy) => {
    copy.nodes[3].type = "unsupported";
  },
  (copy) => {
    copy.nodes[0].inputs.surface.link.socket = "value";
  },
]) {
  const copy = structuredClone(graph);
  mutate(copy);
  assert.throws(() => compileMaterialGraph(copy));
}
const color = graphFixture();
color.nodes[3] = { id: "value", type: "rgb", value: [0.5, 0.2, 0.1, 1] };
color.nodes[2].inputs.a.link.socket = "color";
assert(
  compileMaterialGraph(color).steps.some((node) => node.op === "luminance"),
);
const root = new THREE.Group();
const original = new THREE.MeshStandardMaterial();
original.userData[BRIDGE_KEY] = JSON.stringify(graph);
const mesh = new THREE.Mesh(new THREE.BoxGeometry(), original);
const second = new THREE.Mesh(mesh.geometry, original);
root.add(mesh, second);
const bridge = await applyBridgeMaterials(root);
assert.equal(bridge.reports.length, 1);
assert.equal(bridge.reports[0].status, "translated");
assert.equal(mesh.material.isMeshPhysicalNodeMaterial, true);
assert.equal(mesh.material, second.material);
assert.equal(mesh.material.userData[BRIDGE_KEY], original.userData[BRIDGE_KEY]);
let disposed = 0;
mesh.material.addEventListener("dispose", () => disposed++);
bridge.setParameter(bridge.reports[0].key, plan.parameters[0].id, 0.8);
bridge.dispose();
bridge.dispose();
assert.equal(disposed, 1);
assert.equal(mesh.material, original);
const invalid = graphFixture();
invalid.nodes[3].type = "unsupported";
original.userData[BRIDGE_KEY] = JSON.stringify(invalid);
const fallback = await applyBridgeMaterials(root);
assert.equal(fallback.reports[0].status, "fallback");
assert.match(fallback.reports[0].message, /unsupported/);
assert.equal(mesh.material, original);
fallback.dispose();
original.dispose();
mesh.geometry.dispose();
console.log(
  "PASS: typed material graph translation, scalar conversion, diagnostics, cycles, unsupported features, shared bindings, live uniforms, and disposal.",
);
