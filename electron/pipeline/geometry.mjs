import { PropertyType } from "@gltf-transform/core";
import {
  dedup,
  prune,
  resample,
  weld,
  simplifyPrimitive,
  join,
  instance,
  dequantize,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
export function meshRows(doc) {
  const nodes = doc.getRoot().listNodes();
  return doc
    .getRoot()
    .listMeshes()
    .map((mesh, id) => {
      const owners = nodes.filter((node) => node.getMesh() === mesh),
        names = owners
          .map((node) => node.getName())
          .filter(Boolean)
          .sort();
      const key = JSON.stringify([mesh.getName(), names]);
      let triangles = 0,
        vertices = 0;
      for (const primitive of mesh.listPrimitives()) {
        vertices += primitive.getAttribute("POSITION")?.getCount() || 0;
        triangles +=
          (primitive.getIndices()?.getCount() ||
            primitive.getAttribute("POSITION")?.getCount() ||
            0) / 3;
      }
      return {
        id,
        key,
        name: mesh.getName() || names[0] || `Mesh ${id + 1}`,
        nodeNames: names,
        triangles: Math.round(triangles),
        vertices,
        primitives: mesh.listPrimitives().length,
        skinned: owners.some((node) => !!node.getSkin()),
        morphTargets: mesh
          .listPrimitives()
          .some((primitive) => primitive.listTargets().length > 0),
      };
    });
}
function ratio(value, fallback, min, max, label) {
  value ??= fallback;
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}
export function normalizeOptimization(input = {}) {
  for (const key of [
    "dedup",
    "prune",
    "cleanAttributes",
    "resample",
    "merge",
    "instance",
    "preserveNamed",
  ])
    if (input[key] !== undefined && typeof input[key] !== "boolean")
      throw new Error(`Invalid ${key} option.`);
  const overrides = input.meshes || [];
  if (!Array.isArray(overrides) || overrides.length > 10000)
    throw new Error("Invalid mesh overrides.");
  const lods = input.lods || [];
  if (
    !Array.isArray(lods) ||
    lods.length > 3 ||
    lods.some((value) => !Number.isFinite(value) || value <= 0 || value >= 1)
  )
    throw new Error("Choose up to three LOD ratios between 0 and 1.");
  return {
    dedup: input.dedup ?? false,
    prune: input.prune ?? false,
    cleanAttributes: input.cleanAttributes ?? false,
    resample: input.resample ?? false,
    merge: input.merge ?? false,
    instance: input.instance ?? false,
    preserveNamed: input.preserveNamed ?? true,
    ratio: ratio(input.ratio, 1, 0.01, 1, "Simplification ratio"),
    error: ratio(input.error, 0.001, 0.000001, 1, "Simplification error"),
    lockBorder: input.lockBorder ?? true,
    lods: [...new Set(lods)].sort((a, b) => b - a),
    singleSided: (input.singleSided || []).map((row) => {
      if (
        typeof row.key !== "string" ||
        !Number.isInteger(row.primitive) ||
        row.primitive < 0
      )
        throw new Error("Invalid single-sided material target.");
      return { key: row.key, primitive: row.primitive };
    }),
    meshes: overrides.map((row) => ({
      key: String(row.key),
      protected: !!row.protected,
      ratio:
        row.ratio === undefined
          ? undefined
          : ratio(row.ratio, 1, 0.01, 1, "Mesh ratio"),
    })),
  };
}
export async function optimizeGeometry(doc, raw = {}, progress = () => {}) {
  const options = normalizeOptimization(raw),
    warnings = [],
    meshes = doc.getRoot().listMeshes(),
    rows = meshRows(doc);
  const protectedNodes = new Set();
  const replacedMaterials = new Set();
  for (const target of options.singleSided) {
    const matches = rows.filter((row) => row.key === target.key);
    if (matches.length !== 1) {
      warnings.push(
        "Skipped a single-sided fix: mesh identity does not match uniquely.",
      );
      continue;
    }
    const primitive = meshes[matches[0].id].listPrimitives()[target.primitive];
    const material = primitive?.getMaterial();
    if (material?.getDoubleSided()) {
      // A shared material may still need backfaces on other primitives.
      primitive.setMaterial(material.clone().setDoubleSided(false));
      replacedMaterials.add(material);
    }
  }
  for (const material of replacedMaterials)
    if (
      material
        .listParents()
        .every((parent) => parent.propertyType === PropertyType.ROOT)
    )
      material.dispose();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(),
      index = meshes.indexOf(mesh),
      override =
        index < 0
          ? null
          : options.meshes.find((item) => item.key === rows[index].key);
    if (override?.protected || (options.preserveNamed && node.getName()))
      protectedNodes.add(node);
  }
  if (options.ratio < 1 || options.meshes.some((row) => row.ratio < 1)) {
    progress("Simplifying geometry…");
    await MeshoptSimplifier.ready;
    await doc.transform(dequantize(), weld());
    for (const [index, mesh] of meshes.entries()) {
      const row = rows[index],
        override = options.meshes.find((item) => item.key === row.key);
      if (override?.protected) continue;
      const target = override?.ratio ?? options.ratio;
      if (target >= 1) continue;
      if (row.skinned || row.morphTargets) {
        warnings.push(
          `Skipped simplification for ${row.name}: skinning or morph targets.`,
        );
        continue;
      }
      for (const primitive of mesh.listPrimitives())
        if (
          primitive.getMode() === 4 &&
          primitive.getAttribute("POSITION") &&
          primitive.getIndices()
        )
          simplifyPrimitive(primitive, {
            simplifier: MeshoptSimplifier,
            ratio: target,
            error: options.error,
            lockBorder: options.lockBorder,
            cleanup: false,
          });
    }
  }
  if (options.resample) {
    progress("Cleaning animation keyframes…");
    await doc.transform(resample());
  }
  if (options.dedup) {
    progress("Removing duplicate resources…");
    await doc.transform(dedup({ keepUniqueNames: options.preserveNamed }));
  }
  if (options.instance) {
    if (doc.getRoot().listAnimations().length) {
      warnings.push("GPU instancing skipped: the model contains animations.");
    } else {
      progress("Instancing repeated meshes…");
      const saved = [];
      for (const node of protectedNodes) {
        const mesh = node.getMesh();
        if (mesh) {
          const copy = mesh.clone();
          node.setMesh(copy);
          saved.push({ node, mesh, copy });
        }
      }
      try {
        await doc.transform(instance({ min: 2 }));
      } finally {
        for (const { node, mesh, copy } of saved) {
          node.setMesh(mesh);
          copy.dispose();
        }
      }
    }
  }
  if (options.merge) {
    progress("Joining compatible primitives…");
    await doc.transform(
      join({
        keepNamed: options.preserveNamed,
        cleanup: false,
        filter: (node) => !protectedNodes.has(node),
      }),
    );
  }
  if (options.prune || options.cleanAttributes) {
    progress("Removing unused resources…");
    await doc.transform(
      prune({
        propertyTypes: [
          PropertyType.ACCESSOR,
          PropertyType.MATERIAL,
          PropertyType.MESH,
          PropertyType.TEXTURE,
          PropertyType.BUFFER,
        ],
        keepAttributes: !options.cleanAttributes,
        keepSolidTextures: true,
        keepLeaves: true,
      }),
    );
  }
  return { options, warnings, meshes: meshRows(doc) };
}
