import {
  SRGBColorSpace,
  type MeshPhysicalMaterial,
  type Material,
  type Texture,
} from "three";
import {
  createMaterialGraph,
  createMaterialNode,
  arrangeMaterialGraph,
  type MaterialNode,
  type MaterialGraph,
} from "./material-editor.ts";

export function sourceMaterialGraph(
  material: Material,
  references?: ReadonlyMap<Texture, string>,
): MaterialGraph {
  const source = material as MeshPhysicalMaterial;
  const graph = createMaterialGraph(material.name || material.type, {
    color: source.color?.toArray(),
    roughness: source.roughness ?? 0.5,
    metalness: source.metalness ?? 0,
    alpha: source.opacity,
    transparent: source.transparent,
  });
  const surface = graph.nodes[0];
  graph.renderSettings = {
    side: source.side,
    alphaTest: source.alphaTest,
    depthWrite: source.depthWrite,
    vertexColors: source.vertexColors,
    flatShading: source.flatShading ?? false,
  };
  const values: Record<string, number | number[] | undefined> = {
    emission: source.emissive?.toArray(),
    emissionStrength: source.emissiveIntensity,
    ior: source.ior,
    transmission: source.transmission,
    thickness: source.thickness,
    attenuationColor: source.attenuationColor?.toArray(),
    attenuationDistance: Number.isFinite(source.attenuationDistance)
      ? source.attenuationDistance
      : 1000000,
    clearcoat: source.clearcoat,
    clearcoatRoughness: source.clearcoatRoughness,
    sheen: source.sheenColor
      ?.clone()
      .multiplyScalar(source.sheen ?? 0)
      .toArray(),
    sheenRoughness: source.sheenRoughness,
    specularIntensity: source.specularIntensity,
    specularColor: source.specularColor?.toArray(),
  };
  for (const [name, value] of Object.entries(values))
    if (value !== undefined) surface.inputs[name] = { value };
  const images = new Map<Texture, MaterialNode>();
  const splitters = new Map<string, MaterialNode>();
  const add = (type: string, label: string) => {
    const node = createMaterialNode(type);
    node.label = label;
    graph.nodes.push(node);
    return node;
  };
  const link = (
    from: MaterialNode,
    output: string,
    to: MaterialNode,
    input: string,
  ) => {
    to.inputs[input] = { link: { node: from.id, socket: output } };
  };
  const image = (texture: Texture, slot: string) => {
    let node = images.get(texture);
    if (!node) {
      node = add("image", texture.name || slot);
      node.sourceTexture = references?.get(texture) || texture.uuid;
      node.imageName = texture.name || slot;
      const dimensions = texture.image as
        { width?: number; height?: number } | undefined;
      node.imageSize = [dimensions?.width || 0, dimensions?.height || 0];
      node.uvChannel = texture.channel;
      node.colorSpace =
        texture.colorSpace === SRGBColorSpace ? "srgb" : "linear";
      node.extension = "source";
      node.interpolation = "source";
      images.set(texture, node);
    }
    return node;
  };
  const channel = (node: MaterialNode, name: string) => {
    if (name === "color" || name === "alpha") return { node, socket: name };
    let separate = splitters.get(node.id);
    if (!separate) {
      separate = add("separateColor", `${node.label} channels`);
      link(node, "color", separate, "color");
      splitters.set(node.id, separate);
    }
    return { node: separate, socket: name };
  };
  const bind = (
    texture: Texture | null | undefined,
    slot: string,
    target: string,
    component = "color",
  ) => {
    if (!texture) return;
    const sampled = channel(image(texture, slot), component);
    const vector = component === "color";
    const factor = surface.inputs[target]?.value ?? (vector ? [1, 1, 1] : 1);
    const multiply = add(
      vector ? "vectorMath" : "math",
      `${target} × material factor`,
    );
    multiply.operation = "MULTIPLY";
    multiply.inputs.b = { value: factor };
    link(sampled.node, sampled.socket, multiply, "a");
    link(multiply, vector ? "vector" : "value", surface, target);
  };
  bind(source.map, "Base color", "color");
  if (source.map) bind(source.map, "Base color", "alpha", "alpha");
  if (source.alphaMap) {
    const previous = surface.inputs.alpha;
    const sampled = channel(image(source.alphaMap, "Alpha"), "green");
    const multiply = add("math", "Alpha map × opacity");
    multiply.operation = "MULTIPLY";
    multiply.inputs.b = previous;
    link(sampled.node, sampled.socket, multiply, "a");
    link(multiply, "value", surface, "alpha");
  }
  bind(source.roughnessMap, "Roughness (green)", "roughness", "green");
  bind(source.metalnessMap, "Metalness (blue)", "metalness", "blue");
  bind(source.emissiveMap, "Emission", "emission");
  if (source.aoMap) {
    const sampled = channel(image(source.aoMap, "Occlusion (red)"), "red");
    const subtract = add("math", "Occlusion − 1");
    subtract.operation = "SUBTRACT";
    subtract.inputs.b.value = 1;
    link(sampled.node, sampled.socket, subtract, "a");
    const strength = add("math", "Occlusion strength");
    strength.operation = "MULTIPLY";
    strength.inputs.b.value = source.aoMapIntensity;
    link(subtract, "value", strength, "a");
    const result = add("math", "Ambient occlusion");
    result.operation = "ADD";
    result.inputs.b.value = 1;
    link(strength, "value", result, "a");
    link(result, "value", surface, "ao");
  }
  if (source.normalMap) {
    const normal = add("normalMap", "Normal Map");
    normal.inputs.scale.value = [source.normalScale.x, source.normalScale.y, 1];
    link(image(source.normalMap, "Normal"), "color", normal, "color");
    link(normal, "normal", surface, "normal");
  }
  bind(source.transmissionMap, "Transmission (red)", "transmission", "red");
  bind(source.thicknessMap, "Thickness (green)", "thickness", "green");
  bind(source.clearcoatMap, "Clearcoat (red)", "clearcoat", "red");
  bind(
    source.clearcoatRoughnessMap,
    "Clearcoat roughness (green)",
    "clearcoatRoughness",
    "green",
  );
  bind(source.sheenColorMap, "Sheen color", "sheen");
  bind(
    source.sheenRoughnessMap,
    "Sheen roughness (alpha)",
    "sheenRoughness",
    "alpha",
  );
  bind(source.specularColorMap, "Specular color", "specularColor");
  bind(
    source.specularIntensityMap,
    "Specular intensity (alpha)",
    "specularIntensity",
    "alpha",
  );
  for (const [slot, value] of Object.entries(source)) {
    if (!(value as Texture | null)?.isTexture || images.has(value as Texture))
      continue;
    const node = image(value as Texture, slot);
    (graph.warnings ||= []).push(
      `${slot} is shown for inspection but is not translated into this graph. Editing the graph may change this effect.`,
    );
  }
  return arrangeMaterialGraph(graph);
}
