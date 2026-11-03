import validator from "gltf-validator";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { localResource, gltfJSON } from "./local-files.mjs";
const threeExtensions = new Set([
  "KHR_draco_mesh_compression",
  "KHR_lights_punctual",
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_dispersion",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_iridescence",
  "KHR_materials_diffuse_roughness",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_unlit",
  "KHR_materials_volume",
  "KHR_mesh_quantization",
  "KHR_meshopt_compression",
  "KHR_texture_basisu",
  "KHR_texture_transform",
  "EXT_materials_bump",
  "EXT_meshopt_compression",
  "EXT_mesh_gpu_instancing",
  "EXT_texture_avif",
  "EXT_texture_webp",
]);
export async function checkModel(file, output) {
  const source = await realpath(file),
    bytes = output || new Uint8Array(await readFile(source)),
    root = path.dirname(source);
  const result = await validator.validateBytes(bytes, {
    uri: path.basename(source),
    maxIssues: 500,
    externalResourceFunction: (uri) => localResource(root, uri),
  });
  let json = {};
  try {
    json = gltfJSON(bytes);
  } catch {}
  const nodeForPointer = (pointer) => {
    let match = pointer?.match(/^\/nodes\/(\d+)/);
    if (match) return Number(match[1]);
    match = pointer?.match(/^\/meshes\/(\d+)/);
    if (match)
      return (json.nodes || []).findIndex(
        (node) => node.mesh === Number(match[1]),
      );
    match = pointer?.match(/^\/materials\/(\d+)/);
    if (match) {
      const meshIndex = (json.meshes || []).findIndex((mesh) =>
        mesh.primitives.some((p) => p.material === Number(match[1])),
      );
      return (json.nodes || []).findIndex((node) => node.mesh === meshIndex);
    }
    return null;
  };
  const meshKey = (index) =>
    JSON.stringify([
      json.meshes?.[index]?.name || "",
      (json.nodes || [])
        .filter((node) => node.mesh === index)
        .map((node) => node.name)
        .filter(Boolean)
        .sort(),
    ]);
  const issues = result.issues.messages.map((issue, index) => ({
    ...issue,
    id: `validator-${index}`,
    nodeIndex: nodeForPointer(issue.pointer),
    source: "glTF Validator",
  }));
  const add = (code, message, pointer, severity = 1) =>
    issues.push({
      id: `check-${issues.length}`,
      code,
      message,
      pointer,
      severity,
      nodeIndex: nodeForPointer(pointer),
      source: "Export checks",
    });
  (json.nodes || []).forEach((node, index) => {
    if (node.scale?.some((value) => value < 0))
      add(
        "NEGATIVE_SCALE",
        "Negative scale can affect winding and culling. Check this object from both sides.",
        `/nodes/${index}`,
        2,
      );
    if (
      node.scale &&
      Math.max(...node.scale) - Math.min(...node.scale) > 0.0001
    )
      add(
        "NON_UNIFORM_SCALE",
        "Non-uniform scale: check normals and the intended dimensions.",
        `/nodes/${index}`,
        2,
      );
  });
  (json.meshes || []).forEach((mesh, index) =>
    mesh.primitives.forEach((primitive, p) => {
      const material = json.materials?.[primitive.material],
        pointer = `/meshes/${index}/primitives/${p}`;
      if (
        !("NORMAL" in (primitive.attributes || {})) &&
        !material?.extensions?.KHR_materials_unlit
      )
        add(
          "MISSING_NORMALS",
          "No vertex normals. Lit materials may appear faceted or incorrect.",
          pointer,
        );
      const uvSets = new Set();
      const scan = (value) => {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          if (
            /Texture$/.test(key) &&
            child &&
            typeof child === "object" &&
            "index" in child
          )
            uvSets.add(
              child.extensions?.KHR_texture_transform?.texCoord ??
                child.texCoord ??
                0,
            );
          else scan(child);
        }
      };
      scan(material);
      for (const uv of uvSets)
        if (!("TEXCOORD_" + uv in (primitive.attributes || {})))
          add(
            "MISSING_UV",
            `A texture uses UV${uv}, but this primitive has no matching coordinates.`,
            pointer,
          );
      if (material?.doubleSided)
        add(
          "DOUBLE_SIDED",
          "Double-sided material. Check whether backface rendering is needed.",
          pointer,
          2,
        );
    }),
  );
  for (const extension of json.extensionsRequired || [])
    if (!threeExtensions.has(extension))
      add(
        "THREE_EXTENSION",
        "Required extension " +
          extension +
          " is not in the bundled Three.js loader support list. A plugin may be needed.",
        "/extensionsRequired",
      );
  for (const issue of issues) {
    if (
      issue.code === "UNUSED_OBJECT" &&
      /^\/meshes\/\d+\/primitives\/\d+\/attributes\/TEXCOORD_\d+$/.test(
        issue.pointer || "",
      )
    )
      issue.fix = { kind: "cleanAttributes" };
    const match = issue.pointer?.match(/^\/meshes\/(\d+)\/primitives\/(\d+)$/);
    if (issue.code === "DOUBLE_SIDED" && match)
      issue.fix = {
        kind: "singleSided",
        key: meshKey(Number(match[1])),
        primitive: Number(match[2]),
      };
  }
  const extensions = json.extensionsUsed || [],
    decoders = [];
  if (extensions.includes("KHR_draco_mesh_compression")) decoders.push("Draco");
  if (extensions.some((name) => /meshopt_compression$/.test(name)))
    decoders.push("Meshopt");
  if (extensions.includes("KHR_texture_basisu")) decoders.push("KTX2 / Basis");
  return {
    validatorVersion: validator.version(),
    errors: issues.filter((row) => row.severity === 0).length,
    warnings: issues.filter((row) => row.severity === 1).length,
    infos: issues.filter((row) => row.severity >= 2).length,
    issues,
    truncated: result.issues.truncated || false,
    decoders,
    extensions,
    animations: (json.animations || []).map((animation, index) => ({
      name: animation.name || `Animation ${index + 1}`,
      channels: animation.channels?.length || 0,
    })),
    units: "glTF meters",
    checkedAt: new Date().toISOString(),
    rendererVersion: "0.187.0",
  };
}
