export type MaterialSocket = {
  value?: number | number[];
  link?: { node: string; socket: string };
};
export const MATERIAL_NODE_WIDTH = 240;
export function materialNodeCategory(type: string) {
  if (type === "principled") return "Shader";
  if (type === "output") return "Output";
  if (
    [
      "image",
      "noise",
      "fractal",
      "turbulence",
      "voronoi",
      "cell",
      "checker",
      "wave",
    ].includes(type)
  )
    return "Texture";
  if (["mapping", "vectorMath", "bump", "normalMap"].includes(type))
    return "Vector";
  if (["math", "mapRange", "ramp", "reroute", "separateColor"].includes(type))
    return "Converter";
  if (type === "mix") return "Color";
  return "Input";
}
export type MaterialNode = {
  id: string;
  type: string;
  label: string;
  position: number[];
  inputs: Record<string, MaterialSocket>;
  value?: number | number[];
  operation?: string;
  clamp?: boolean;
  invert?: boolean;
  errors?: string[];
  image?: string;
  sourceTexture?: string;
  imageName?: string;
  imageSize?: number[];
  uvChannel?: number;
  colorSpace?: string;
  extension?: string;
  interpolation?: string;
  expanded?: boolean;
  stops?: { position: number; color: number[] }[];
};
export type MaterialGraph = {
  version: 1;
  id: string;
  name: string;
  output: string | null;
  nodes: MaterialNode[];
  transparent?: boolean;
  warnings?: string[];
  renderSettings?: {
    side: number;
    alphaTest: number;
    depthWrite: boolean;
    vertexColors: boolean;
    flatShading: boolean;
  };
};
type SocketDefinition = {
  name: string;
  kind: "float" | "color" | "vector" | "shader";
  value?: number | number[];
};
export const materialNodeTypes: Record<
  string,
  { label: string; inputs: SocketDefinition[]; outputs: SocketDefinition[] }
> = {
  value: {
    label: "Value",
    inputs: [],
    outputs: [{ name: "value", kind: "float" }],
  },
  rgb: {
    label: "RGB Color",
    inputs: [],
    outputs: [{ name: "color", kind: "color" }],
  },
  uv: {
    label: "UV Coordinates",
    inputs: [],
    outputs: [
      { name: "uv", kind: "vector" },
      { name: "window", kind: "vector" },
    ],
  },
  screen: {
    label: "Screen Space",
    inputs: [],
    outputs: [
      { name: "uv", kind: "vector" },
      { name: "x", kind: "float" },
      { name: "y", kind: "float" },
      { name: "pixels", kind: "vector" },
      { name: "resolution", kind: "vector" },
    ],
  },
  time: {
    label: "Time",
    inputs: [
      { name: "speed", kind: "float", value: 1 },
      { name: "offset", kind: "float", value: 0 },
    ],
    outputs: [
      { name: "seconds", kind: "float" },
      { name: "delta", kind: "float" },
      { name: "frame", kind: "float" },
    ],
  },
  ramp: {
    label: "Color Ramp",
    inputs: [{ name: "factor", kind: "float", value: 0.5 }],
    outputs: [
      { name: "color", kind: "color" },
      { name: "alpha", kind: "float" },
    ],
  },
  mapping: {
    label: "Mapping",
    inputs: [
      { name: "vector", kind: "vector", value: [0, 0, 0] },
      { name: "location", kind: "vector", value: [0, 0, 0] },
      { name: "rotation", kind: "vector", value: [0, 0, 0] },
      { name: "scale", kind: "vector", value: [1, 1, 1] },
    ],
    outputs: [{ name: "vector", kind: "vector" }],
  },
  vectorMath: {
    label: "Vector Math",
    inputs: [
      { name: "a", kind: "vector", value: [0, 0, 0] },
      { name: "b", kind: "vector", value: [1, 1, 1] },
      { name: "scale", kind: "float", value: 1 },
    ],
    outputs: [
      { name: "vector", kind: "vector" },
      { name: "value", kind: "float" },
    ],
  },
  mapRange: {
    label: "Map Range",
    inputs: [
      { name: "value", kind: "float", value: 1 },
      { name: "fromMin", kind: "float", value: 0 },
      { name: "fromMax", kind: "float", value: 1 },
      { name: "toMin", kind: "float", value: 0 },
      { name: "toMax", kind: "float", value: 1 },
      { name: "steps", kind: "float", value: 4 },
    ],
    outputs: [{ name: "value", kind: "float" }],
  },
  bump: {
    label: "Bump",
    inputs: [
      { name: "height", kind: "float", value: 0 },
      { name: "strength", kind: "float", value: 1 },
      { name: "distance", kind: "float", value: 1 },
      { name: "normal", kind: "vector" },
    ],
    outputs: [{ name: "normal", kind: "vector" }],
  },
  normalMap: {
    label: "Normal Map",
    inputs: [
      { name: "color", kind: "color", value: [0.5, 0.5, 1] },
      { name: "strength", kind: "float", value: 1 },
      { name: "scale", kind: "vector", value: [1, 1, 1] },
    ],
    outputs: [{ name: "normal", kind: "vector" }],
  },
  math: {
    label: "Math",
    inputs: [
      { name: "a", kind: "float", value: 0 },
      { name: "b", kind: "float", value: 1 },
    ],
    outputs: [{ name: "value", kind: "float" }],
  },
  mix: {
    label: "Mix Color",
    inputs: [
      { name: "factor", kind: "float", value: 0.5 },
      { name: "a", kind: "color", value: [0.1, 0.2, 0.5] },
      { name: "b", kind: "color", value: [0.8, 0.3, 0.1] },
    ],
    outputs: [{ name: "color", kind: "color" }],
  },
  image: {
    label: "Image Texture",
    inputs: [{ name: "vector", kind: "vector" }],
    outputs: [
      { name: "color", kind: "color" },
      { name: "alpha", kind: "float" },
    ],
  },
  separateColor: {
    label: "Separate Color",
    inputs: [{ name: "color", kind: "color", value: [0, 0, 0] }],
    outputs: [
      { name: "red", kind: "float" },
      { name: "green", kind: "float" },
      { name: "blue", kind: "float" },
    ],
  },
  reroute: {
    label: "Reroute",
    inputs: [{ name: "value", kind: "float", value: 0 }],
    outputs: [{ name: "value", kind: "float" }],
  },
  principled: {
    label: "Principled BSDF",
    inputs: [
      { name: "color", kind: "color", value: [0.5, 0.5, 0.5] },
      { name: "metalness", kind: "float", value: 0 },
      { name: "roughness", kind: "float", value: 0.5 },
      { name: "ior", kind: "float", value: 1.5 },
      { name: "alpha", kind: "float", value: 1 },
      { name: "emission", kind: "color", value: [0, 0, 0] },
      { name: "emissionStrength", kind: "float", value: 1 },
      { name: "normal", kind: "vector" },
      { name: "ao", kind: "float", value: 1 },
      { name: "transmission", kind: "float", value: 0 },
      { name: "thickness", kind: "float", value: 0 },
      { name: "attenuationDistance", kind: "float", value: 1000000 },
      { name: "attenuationColor", kind: "color", value: [1, 1, 1] },
      { name: "clearcoat", kind: "float", value: 0 },
      { name: "clearcoatRoughness", kind: "float", value: 0.03 },
      { name: "sheen", kind: "color", value: [0, 0, 0] },
      { name: "sheenRoughness", kind: "float", value: 0.5 },
      { name: "diffuseRoughness", kind: "float", value: 0 },
      { name: "specularIntensity", kind: "float", value: 1 },
      { name: "specularColor", kind: "color", value: [1, 1, 1] },
    ],
    outputs: [{ name: "shader", kind: "shader" }],
  },
  output: {
    label: "Material Output",
    inputs: [{ name: "surface", kind: "shader" }],
    outputs: [],
  },
};
for (const [type, label] of Object.entries({
  noise: "Noise (Perlin)",
  fractal: "Fractal Noise (fBM)",
  turbulence: "Turbulence",
  voronoi: "Voronoi Distance",
  cell: "Cell Noise",
  checker: "Checker",
  wave: "Wave Bands",
})) {
  materialNodeTypes[type] = {
    label,
    inputs: [
      { name: "vector", kind: "vector" },
      { name: "scale", kind: "float", value: 5 },
      ...(["fractal", "turbulence"].includes(type)
        ? [
            { name: "detail", kind: "float" as const, value: 3 },
            { name: "roughness", kind: "float" as const, value: 0.5 },
            { name: "lacunarity", kind: "float" as const, value: 2 },
          ]
        : []),
    ],
    outputs: [
      { name: "factor", kind: "float" },
      { name: "color", kind: "color" },
    ],
  };
}
export function createMaterialNode(
  type: string,
  position = [0, 0],
): MaterialNode {
  const definition = materialNodeTypes[type];
  if (!definition) throw new Error("Unknown material node type.");
  return {
    id: crypto.randomUUID(),
    type,
    label: definition.label,
    position,
    inputs: Object.fromEntries(
      definition.inputs
        .filter((socket) => socket.value !== undefined)
        .map((socket) => [
          socket.name,
          { value: structuredClone(socket.value) },
        ]),
    ),
    ...(type === "value" ? { value: 0.5 } : {}),
    ...(type === "rgb" ? { value: [0.5, 0.5, 0.5] } : {}),
    ...(type === "math" ? { operation: "MULTIPLY" } : {}),
    ...(type === "mapping" ? { operation: "POINT" } : {}),
    ...(type === "vectorMath" ? { operation: "ADD" } : {}),
    ...(type === "mapRange" ? { interpolation: "LINEAR", clamp: true } : {}),
    ...(type === "mix" ? { operation: "MIX" } : {}),
    ...(type === "ramp"
      ? {
          interpolation: "linear",
          stops: [
            { position: 0, color: [0, 0, 0, 1] },
            { position: 1, color: [1, 1, 1, 1] },
          ],
        }
      : {}),
    ...(type === "image"
      ? { colorSpace: "srgb", extension: "repeat", interpolation: "linear" }
      : {}),
  };
}
export function materialInputs(node: MaterialNode) {
  const inputs = materialNodeTypes[node.type]?.inputs || [];
  if (
    node.type === "mapping" &&
    ["VECTOR", "NORMAL"].includes(node.operation || "POINT")
  )
    return inputs.filter((socket) => socket.name !== "location");
  if (node.type === "mapRange" && node.interpolation !== "STEPPED")
    return inputs.filter((socket) => socket.name !== "steps");
  if (node.type === "vectorMath") {
    const unary = [
      "LENGTH",
      "NORMALIZE",
      "ABSOLUTE",
      "FLOOR",
      "CEIL",
      "FRACTION",
      "SINE",
      "COSINE",
    ].includes(node.operation || "ADD");
    return inputs.filter(
      (socket) =>
        socket.name === "a" ||
        (node.operation === "SCALE"
          ? socket.name === "scale"
          : !unary && socket.name === "b"),
    );
  }
  return node.type !== "principled"
    ? inputs
    : inputs.filter((socket, index) => {
        const input = node.inputs[socket.name];
        return (
          index < 8 ||
          node.expanded ||
          input?.link ||
          (input?.value !== undefined &&
            JSON.stringify(input.value) !== JSON.stringify(socket.value))
        );
      });
}
export function materialOutputs(node: MaterialNode) {
  const outputs = materialNodeTypes[node.type]?.outputs || [];
  if (node.type !== "vectorMath") return outputs;
  const scalar = ["DOT_PRODUCT", "DISTANCE", "LENGTH"].includes(
    node.operation || "ADD",
  );
  return outputs.filter(
    (socket) => socket.name === (scalar ? "value" : "vector"),
  );
}
export function materialSocketY(
  node: MaterialNode,
  name: string,
  direction: "inputs" | "outputs",
) {
  const sockets =
    direction === "inputs" ? materialInputs(node) : materialOutputs(node);
  const index = Math.max(
    0,
    sockets.findIndex((socket) => socket.name === name),
  );
  return direction === "outputs"
    ? 49 + index * 28
    : 53 +
        materialOutputs(node).length * 28 +
        (node.type === "principled" ? 36 : 0) +
        index * 36;
}
export function materialNodeHeight(node: MaterialNode) {
  const properties =
    node.type === "ramp"
      ? 120 + (node.stops?.length || 0) * 100
      : node.type === "image"
        ? 320
        : [
              "math",
              "mapRange",
              "normalMap",
              "mapping",
              "bump",
              "vectorMath",
            ].includes(node.type)
          ? 80
          : node.type === "principled"
            ? 42
            : 32;
  return (
    86 +
    materialOutputs(node).length * 28 +
    materialInputs(node).length * 36 +
    properties
  );
}
export function createMaterialGraph(
  name: string,
  values: {
    color?: number[];
    metalness?: number;
    roughness?: number;
    alpha?: number;
    transparent?: boolean;
  } = {},
): MaterialGraph {
  const surface = createMaterialNode("principled", [180, 80]),
    output = createMaterialNode("output", [520, 80]);
  for (const [name, value] of Object.entries(values))
    if (typeof value === "number" || Array.isArray(value))
      surface.inputs[name] = { value };
  output.inputs.surface = { link: { node: surface.id, socket: "shader" } };
  return {
    version: 1,
    id: crypto.randomUUID(),
    name,
    nodes: [surface, output],
    output: output.id,
    transparent: values.transparent ?? false,
  };
}
export function parseMaterialGraph(raw: unknown): MaterialGraph {
  const graph = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (
    !graph ||
    graph.version !== 1 ||
    typeof graph.id !== "string" ||
    typeof graph.name !== "string" ||
    !Array.isArray(graph.nodes) ||
    graph.nodes.length > 512 ||
    !(graph.output === null || typeof graph.output === "string")
  )
    throw new Error("Invalid material graph file (expected schema version 1).");
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (
      !node ||
      typeof node.id !== "string" ||
      ids.has(node.id) ||
      typeof node.type !== "string" ||
      typeof node.label !== "string" ||
      !Array.isArray(node.position) ||
      node.position.length !== 2 ||
      !node.position.every(
        (value: unknown) =>
          typeof value === "number" &&
          Number.isFinite(value) &&
          Math.abs(value) <= 10000,
      ) ||
      !node.inputs ||
      typeof node.inputs !== "object" ||
      Array.isArray(node.inputs)
    )
      throw new Error("Invalid material node.");
    ids.add(node.id);
    if (
      node.stops !== undefined &&
      (!Array.isArray(node.stops) ||
        node.stops.length < 2 ||
        node.stops.length > 32 ||
        !node.stops.every(
          (stop: { position: number; color: number[] }) =>
            stop &&
            Number.isFinite(stop.position) &&
            stop.position >= 0 &&
            stop.position <= 1 &&
            Array.isArray(stop.color) &&
            stop.color.length === 4 &&
            stop.color.every(Number.isFinite),
        ))
    )
      throw new Error("Invalid color ramp stops.");
    if (
      node.errors !== undefined &&
      (!Array.isArray(node.errors) ||
        !node.errors.every((error: unknown) => typeof error === "string"))
    )
      throw new Error("Invalid node diagnostics.");
    for (const socket of Object.values(node.inputs) as MaterialSocket[]) {
      if (!socket || typeof socket !== "object")
        throw new Error("Invalid input socket.");
      if (
        socket.link &&
        (typeof socket.link.node !== "string" ||
          typeof socket.link.socket !== "string")
      )
        throw new Error("Invalid socket connection.");
      if (
        socket.value !== undefined &&
        !(typeof socket.value === "number" && Number.isFinite(socket.value)) &&
        !(
          Array.isArray(socket.value) &&
          socket.value.every(
            (value) => typeof value === "number" && Number.isFinite(value),
          )
        )
      )
        throw new Error("Invalid socket default.");
    }
  }
  return graph;
}
export function connectMaterialNodes(
  graph: MaterialGraph,
  sourceId: string,
  socketName: string,
  targetId: string,
  inputName: string,
): MaterialGraph {
  const source = graph.nodes.find((node) => node.id === sourceId),
    target = graph.nodes.find((node) => node.id === targetId);
  const output =
    source &&
    materialOutputs(source).find((socket) => socket.name === socketName);
  const input =
    target &&
    materialNodeTypes[target.type]?.inputs.find(
      (socket) => socket.name === inputName,
    );
  if (!source || !target || !output || !input)
    throw new Error("Choose a supported output and input socket.");
  if ((output.kind === "shader") !== (input.kind === "shader"))
    throw new Error("Shader sockets connect only to shader sockets.");
  const visited = new Set<string>();
  const dependsOnTarget = (id: string): boolean => {
    if (id === targetId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return Object.values(
      graph.nodes.find((node) => node.id === id)?.inputs || {},
    ).some((socket) => socket.link && dependsOnTarget(socket.link.node));
  };
  if (dependsOnTarget(sourceId))
    throw new Error("This connection would create a cycle.");
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id !== targetId
        ? node
        : {
            ...node,
            inputs: {
              ...node.inputs,
              [inputName]: { link: { node: sourceId, socket: socketName } },
            },
          },
    ),
  };
}
export function nearestMaterialSocket(
  graph: MaterialGraph,
  point: { x: number; y: number },
  direction: "inputs" | "outputs",
  radius: number,
  source?: { node: string; socket: string },
) {
  let nearest: { node: string; socket: string; x: number; y: number } | null =
    null;
  let distance = radius;
  for (const node of graph.nodes) {
    const definition = materialNodeTypes[node.type];
    for (const [index, socket] of (direction === "inputs"
      ? materialInputs(node)
      : materialOutputs(node)
    ).entries()) {
      const x =
        node.position[0] + (direction === "outputs" ? MATERIAL_NODE_WIDTH : 0);
      const y =
        -node.position[1] + materialSocketY(node, socket.name, direction);
      const candidateDistance = Math.hypot(point.x - x, point.y - y);
      if (candidateDistance > distance) continue;
      if (source) {
        try {
          connectMaterialNodes(
            graph,
            source.node,
            source.socket,
            node.id,
            socket.name,
          );
        } catch {
          continue;
        }
      }
      distance = candidateDistance;
      nearest = { node: node.id, socket: socket.name, x, y };
    }
  }
  return nearest;
}
export function insertMaterialNode(
  graph: MaterialGraph,
  insertedId: string,
  targetId: string,
  inputName: string,
) {
  const inserted = graph.nodes.find((node) => node.id === insertedId);
  const target = graph.nodes.find((node) => node.id === targetId);
  const link = target?.inputs[inputName]?.link;
  const source = graph.nodes.find((node) => node.id === link?.node);
  if (
    !inserted ||
    !target ||
    !source ||
    !link ||
    insertedId === targetId ||
    insertedId === source.id
  )
    throw new Error("Choose an existing wire between other nodes.");
  const sourceKind = materialOutputs(source).find(
    (socket) => socket.name === link.socket,
  )?.kind;
  const targetKind = materialNodeTypes[target.type]?.inputs.find(
    (socket) => socket.name === inputName,
  )?.kind;
  const definition = materialNodeTypes[inserted.type];
  const inputs = [...(definition?.inputs || [])]
    .filter((socket) => !inserted.inputs[socket.name]?.link)
    .sort(
      (first, second) =>
        Number(second.kind === sourceKind) - Number(first.kind === sourceKind),
    );
  const outputs = [...materialOutputs(inserted)].sort(
    (first, second) =>
      Number(second.kind === targetKind) - Number(first.kind === targetKind),
  );
  for (const input of inputs)
    for (const output of outputs) {
      try {
        const next = connectMaterialNodes(
          graph,
          source.id,
          link.socket,
          insertedId,
          input.name,
        );
        return connectMaterialNodes(
          next,
          insertedId,
          output.name,
          targetId,
          inputName,
        );
      } catch {}
    }
  throw new Error("This node has no free compatible path through the wire.");
}
export function findMaterialWireInsertion(
  graph: MaterialGraph,
  insertedId: string,
) {
  const inserted = graph.nodes.find((node) => node.id === insertedId);
  if (!inserted) return null;
  const left = inserted.position[0],
    top = -inserted.position[1];
  let nearest: { node: string; input: string } | null = null;
  let nearestDistance = Infinity;
  for (const target of graph.nodes)
    for (const [input, socket] of Object.entries(target.inputs)) {
      if (
        !socket.link ||
        target.id === insertedId ||
        socket.link.node === insertedId
      )
        continue;
      const source = graph.nodes.find((node) => node.id === socket.link!.node);
      if (!source) continue;
      const outputIndex =
        materialOutputs(source).findIndex(
          (output) => output.name === socket.link!.socket,
        ) ?? -1;
      const inputIndex = materialInputs(target).findIndex(
        (entry) => entry.name === input,
      );
      if (outputIndex < 0 || inputIndex < 0) continue;
      const startX = source.position[0] + MATERIAL_NODE_WIDTH,
        startY =
          -source.position[1] +
          materialSocketY(source, socket.link.socket, "outputs");
      const endX = target.position[0],
        endY = -target.position[1] + materialSocketY(target, input, "inputs");
      const bend = Math.max(
        60,
        Math.min(
          280,
          Math.abs(endX - startX) * 0.5 + Math.abs(endY - startY) * 0.15,
        ),
      );
      let candidateDistance = Infinity;
      for (let index = 1; index < 40; index++) {
        const progress = index / 40,
          reverse = 1 - progress;
        const pointX =
          reverse ** 3 * startX +
          3 * reverse ** 2 * progress * (startX + bend) +
          3 * reverse * progress ** 2 * (endX - bend) +
          progress ** 3 * endX;
        const pointY =
          reverse ** 3 * startY +
          3 * reverse ** 2 * progress * startY +
          3 * reverse * progress ** 2 * endY +
          progress ** 3 * endY;
        if (
          pointX >= left - 8 &&
          pointX <= left + MATERIAL_NODE_WIDTH + 8 &&
          pointY >= top + 30 &&
          pointY <= top + 150
        )
          candidateDistance = Math.min(
            candidateDistance,
            Math.hypot(
              pointX - left - MATERIAL_NODE_WIDTH / 2,
              pointY - top - 80,
            ),
          );
      }
      if (candidateDistance >= nearestDistance) continue;
      try {
        insertMaterialNode(graph, insertedId, target.id, input);
      } catch {
        continue;
      }
      nearestDistance = candidateDistance;
      nearest = { node: target.id, input };
    }
  return nearest;
}
export function removeMaterialNodes(
  graph: MaterialGraph,
  ids: string[],
): MaterialGraph {
  return {
    ...graph,
    output: ids.includes(graph.output || "") ? null : graph.output,
    nodes: graph.nodes
      .filter((node) => !ids.includes(node.id))
      .map((node) => ({
        ...node,
        inputs: Object.fromEntries(
          Object.entries(node.inputs).filter(
            ([, socket]) => !socket.link || !ids.includes(socket.link.node),
          ),
        ),
      })),
  };
}
export function disconnectMaterialInput(
  graph: MaterialGraph,
  target: string,
  input: string,
): MaterialGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id !== target) return node;
      const inputs = { ...node.inputs };
      delete inputs[input];
      return { ...node, inputs };
    }),
  };
}
export function arrangeMaterialGraph(graph: MaterialGraph): MaterialGraph {
  const levels = new Map<string, number>(),
    visiting = new Set<string>();
  const level = (id: string): number => {
    if (levels.has(id)) return levels.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const links = Object.values(
      graph.nodes.find((node) => node.id === id)?.inputs || {},
    ).flatMap((socket) => (socket.link ? [socket.link.node] : []));
    const result = links.length ? 1 + Math.max(...links.map(level)) : 0;
    visiting.delete(id);
    levels.set(id, result);
    return result;
  };
  const rows = new Map<number, number>();
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const column = level(node.id),
        row = rows.get(column) || 0;
      const definition = materialNodeTypes[node.type];
      rows.set(column, row + materialNodeHeight(node) + 40);
      return { ...node, position: [60 + column * 310, -(60 + row)] };
    }),
  };
}
