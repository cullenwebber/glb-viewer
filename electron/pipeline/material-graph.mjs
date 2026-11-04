export const BRIDGE_KEY = "glb_viewer_material";
export function materialUtility(TSL, operation, args) {
  const first = args[0],
    second = args[1];
  const divide = (numerator = first, denominator = second) =>
    numerator
      .div(TSL.select(denominator.equal(0), 1, denominator))
      .mul(TSL.select(denominator.equal(0), 0, 1));
  const normalize = (vector = first) => divide(vector, vector.length());
  switch (operation) {
    case "mapping_POINT":
      return TSL.rotate(first.mul(args[3]), args[2], "ZYX").add(second);
    case "mapping_VECTOR":
      return TSL.rotate(first.mul(args[3]), args[2], "ZYX");
    case "mapping_TEXTURE":
      return divide(
        TSL.rotate(first.sub(second), args[2].negate(), "XYZ"),
        args[3],
      );
    case "mapping_NORMAL":
      return normalize(TSL.rotate(divide(first, args[3]), args[2], "ZYX"));
    case "vector_ADD":
      return first.add(second);
    case "vector_SUBTRACT":
      return first.sub(second);
    case "vector_MULTIPLY":
      return first.mul(second);
    case "vector_DIVIDE":
      return divide(first, second);
    case "vector_SCALE":
      return first.mul(args[2]);
    case "vector_CROSS_PRODUCT":
      return first.cross(second);
    case "vector_DOT_PRODUCT":
      return first.dot(second);
    case "vector_DISTANCE":
      return first.distance(second);
    case "vector_LENGTH":
      return first.length();
    case "vector_NORMALIZE":
      return normalize(first);
    case "vector_ABSOLUTE":
      return first.abs();
    case "vector_MINIMUM":
      return first.min(second);
    case "vector_MAXIMUM":
      return first.max(second);
    case "vector_FLOOR":
      return first.floor();
    case "vector_CEIL":
      return first.ceil();
    case "vector_FRACTION":
      return first.fract();
    case "vector_SINE":
      return first.sin();
    case "vector_COSINE":
      return first.cos();
    case "map_LINEAR":
    case "map_STEPPED":
    case "map_SMOOTHSTEP":
    case "map_SMOOTHERSTEP": {
      let factor = divide(first.sub(second), args[2].sub(second));
      if (operation === "map_STEPPED")
        factor = divide(factor.mul(args[5].add(1)).floor(), args[5]);
      if (operation === "map_SMOOTHSTEP") factor = TSL.smoothstep(0, 1, factor);
      if (operation === "map_SMOOTHERSTEP") {
        factor = factor.clamp();
        factor = factor
          .mul(factor)
          .mul(factor)
          .mul(factor.mul(factor.mul(6).sub(15)).add(10));
      }
      const result = TSL.mix(args[3], args[4], factor);
      return TSL.select(
        args[6].greaterThan(0),
        result.clamp(args[3].min(args[4]), args[3].max(args[4])),
        result,
      );
    }
    case "bump": {
      const normal = args[3];
      const tangentX = TSL.positionView.dFdx();
      const tangentY = TSL.positionView.dFdy();
      const crossX = tangentY.cross(normal);
      const crossY = normal.cross(tangentX);
      const determinant = tangentX.dot(crossX).mul(TSL.faceDirection);
      const gradient = crossX
        .mul(first.dFdx())
        .add(crossY.mul(first.dFdy()))
        .mul(determinant.sign())
        .mul(args[2]);
      const perturbed = normalize(normal.mul(determinant.abs()).sub(gradient));
      return normalize(
        normal.mix(
          TSL.select(
            determinant.abs().greaterThan(0.00000001),
            perturbed,
            normal,
          ),
          second.clamp(),
        ),
      );
    }
    case "normalMap": {
      const normal = first.mul(2).sub(1);
      const strength = second.max(0);
      return TSL.normalMap(
        normal
          .mul(strength)
          .add(TSL.vec3(0, 0, strength.oneMinus()))
          .mul(0.5)
          .add(0.5),
      );
    }
    default:
      throw new Error(`Unsupported material utility: ${operation}`);
  }
}
export const physicalInputs = {
  transmission: ["transmissionNode", "float", 0],
  thickness: ["thicknessNode", "float", 0],
  attenuationDistance: ["attenuationDistanceNode", "float", 1000000],
  attenuationColor: ["attenuationColorNode", "vec3", [1, 1, 1]],
  clearcoat: ["clearcoatNode", "float", 0],
  clearcoatRoughness: ["clearcoatRoughnessNode", "float", 0.03],
  sheen: ["sheenNode", "vec3", [0, 0, 0]],
  sheenRoughness: ["sheenRoughnessNode", "float", 0.5],
  diffuseRoughness: ["diffuseRoughnessNode", "float", 0],
  specularIntensity: ["specularIntensityNode", "float", 1],
  specularColor: ["specularColorNode", "vec3", [1, 1, 1]],
};

export function inspectMaterialGraph(raw) {
  const graph = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length > 512)
    return [];
  return graph.nodes
    .filter((node) => node && typeof node.id === "string")
    .map((node, index) => ({
      id: node.id,
      label: String(node.label || node.type),
      type: String(node.type),
      position:
        Array.isArray(node.position) &&
        node.position.length === 2 &&
        node.position.every(Number.isFinite)
          ? node.position.map((value) =>
              Math.max(-10000, Math.min(10000, value)),
            )
          : [index * 220, 0],
      inputs: Object.entries(node.inputs || {})
        .filter(([, socket]) => socket?.link)
        .map(([name, socket]) => ({
          name,
          source: String(socket.link.node),
          socket: String(socket.link.socket),
        })),
      connected: false,
    }));
}

export function compileMaterialGraph(raw) {
  const graph = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (
    !graph ||
    graph.version !== 1 ||
    typeof graph.id !== "string" ||
    !Array.isArray(graph.nodes) ||
    graph.nodes.length > 512
  )
    throw new Error(
      "Invalid or unsupported Blender material graph (expected version 1, at most 512 nodes).",
    );
  const nodes = new Map();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== "string" || nodes.has(node.id))
      throw new Error("Material graph contains invalid or duplicate node IDs.");
    nodes.set(node.id, node);
  }
  const steps = [],
    parameters = [],
    visited = new Set(),
    visiting = new Set(),
    cache = new Map();
  const step = (op, kind, args = [], properties = {}) => {
    const result = { id: `node${steps.length}`, op, kind, args, ...properties };
    steps.push(result);
    return result;
  };
  const constant = (value, kind) => {
    if (kind === "float" && typeof value === "number" && Number.isFinite(value))
      return step("float", kind, [], { value });
    if (
      kind === "vec3" &&
      Array.isArray(value) &&
      value.length >= 3 &&
      value
        .slice(0, 3)
        .every((entry) => typeof entry === "number" && Number.isFinite(entry))
    )
      return step("vec3", kind, [], { value: value.slice(0, 3) });
    throw new Error("Invalid material socket value.");
  };
  const convert = (source, kind) =>
    source.kind === kind
      ? source
      : step(kind === "float" ? "luminance" : "splat", kind, [source.id]);
  const input = (node, name, kind, fallback) => {
    const socket = node.inputs?.[name];
    return socket?.link
      ? convert(output(socket.link.node, socket.link.socket), kind)
      : constant(socket?.value ?? fallback, kind);
  };
  const output = (id, socket = "value") => {
    const key = `${id}:${socket}`;
    if (cache.has(key)) return cache.get(key);
    if (visiting.has(key)) throw new Error("Material graph contains a cycle.");
    const node = nodes.get(id);
    if (!node) throw new Error(`Missing linked node: ${id}`);
    if (node.errors?.length)
      throw new Error(`${node.label}: ${node.errors.join("; ")}`);
    visiting.add(key);
    visited.add(id);
    let result;
    if (node.type === "value" && socket === "value") {
      const value = constant(node.value, "float");
      value.op = "uniform";
      parameters.push({
        id: value.id,
        label: node.label || id,
        value: node.value,
      });
      result = value;
    } else if (node.type === "rgb" && socket === "color") {
      result = constant(node.value, "vec3");
    } else if (node.type === "uv" && socket === "uv") {
      result = step("uv", "vec3");
    } else if (
      (node.type === "screen" &&
        ["uv", "x", "y", "pixels", "resolution"].includes(socket)) ||
      (node.type === "uv" && socket === "window")
    ) {
      result = step(
        `screen_${socket === "window" ? "uv" : socket}`,
        ["x", "y"].includes(socket) ? "float" : "vec3",
      );
    } else if (
      node.type === "time" &&
      ["seconds", "delta", "frame"].includes(socket)
    ) {
      result = step(
        `time_${socket}`,
        "float",
        socket === "seconds"
          ? [
              input(node, "speed", "float", 1).id,
              input(node, "offset", "float", 0).id,
            ]
          : [],
      );
    } else if (node.type === "mapping" && socket === "vector") {
      const operation = node.operation || "POINT";
      if (!["POINT", "TEXTURE", "VECTOR", "NORMAL"].includes(operation))
        throw new Error(`Unsupported Mapping type: ${operation}`);
      result = step(`mapping_${operation}`, "vec3", [
        input(node, "vector", "vec3", [0, 0, 0]).id,
        (["POINT", "TEXTURE"].includes(operation)
          ? input(node, "location", "vec3", [0, 0, 0])
          : constant([0, 0, 0], "vec3")
        ).id,
        input(node, "rotation", "vec3", [0, 0, 0]).id,
        input(node, "scale", "vec3", [1, 1, 1]).id,
      ]);
    } else if (
      node.type === "vectorMath" &&
      ["vector", "value"].includes(socket)
    ) {
      const operation = node.operation || "ADD";
      const scalar = ["DOT_PRODUCT", "DISTANCE", "LENGTH"].includes(operation);
      if (
        ![
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
        ].includes(operation)
      )
        throw new Error(`Unsupported Vector Math operation: ${operation}`);
      if ((socket === "value") !== scalar)
        throw new Error(
          `${operation} uses the ${scalar ? "value" : "vector"} output.`,
        );
      const binary = [
        "ADD",
        "SUBTRACT",
        "MULTIPLY",
        "DIVIDE",
        "CROSS_PRODUCT",
        "DOT_PRODUCT",
        "DISTANCE",
        "MINIMUM",
        "MAXIMUM",
      ].includes(operation);
      result = step(`vector_${operation}`, scalar ? "float" : "vec3", [
        input(node, "a", "vec3", [0, 0, 0]).id,
        (binary
          ? input(node, "b", "vec3", [0, 0, 0])
          : constant([0, 0, 0], "vec3")
        ).id,
        (operation === "SCALE"
          ? input(node, "scale", "float", 1)
          : constant(1, "float")
        ).id,
      ]);
    } else if (node.type === "mapRange" && socket === "value") {
      const interpolation = node.interpolation || "LINEAR";
      if (
        !["LINEAR", "STEPPED", "SMOOTHSTEP", "SMOOTHERSTEP"].includes(
          interpolation,
        )
      )
        throw new Error(
          `Unsupported Map Range interpolation: ${interpolation}`,
        );
      result = step(`map_${interpolation}`, "float", [
        ...[
          ["value", 1],
          ["fromMin", 0],
          ["fromMax", 1],
          ["toMin", 0],
          ["toMax", 1],
          ["steps", 4],
        ].map(
          ([name, fallback]) =>
            (name === "steps" && interpolation !== "STEPPED"
              ? constant(fallback, "float")
              : input(node, name, "float", fallback)
            ).id,
        ),
        constant(node.clamp === false ? 0 : 1, "float").id,
      ]);
    } else if (node.type === "bump" && socket === "normal") {
      const distance = input(node, "distance", "float", 1);
      result = step("bump", "vec3", [
        input(node, "height", "float", 0).id,
        input(node, "strength", "float", 1).id,
        node.invert
          ? step("mul", "float", [distance.id, constant(-1, "float").id]).id
          : distance.id,
        node.inputs?.normal?.link
          ? input(node, "normal", "vec3", [0, 0, 1]).id
          : step("normalView", "vec3").id,
      ]);
    } else if (node.type === "normalMap" && socket === "normal") {
      result = step("normalMap", "vec3", [
        input(node, "color", "vec3", [0.5, 0.5, 1]).id,
        input(node, "strength", "float", 1).id,
      ]);
    } else if (node.type === "ramp" && ["color", "alpha"].includes(socket)) {
      if (
        !Array.isArray(node.stops) ||
        node.stops.length < 2 ||
        node.stops.length > 32 ||
        !node.stops.every(
          (stop) =>
            stop &&
            Number.isFinite(stop.position) &&
            stop.position >= 0 &&
            stop.position <= 1 &&
            Array.isArray(stop.color) &&
            stop.color.length === 4 &&
            stop.color.every(Number.isFinite),
        )
      )
        throw new Error("Color Ramp needs 2–32 valid RGBA stops within 0–1.");
      const interpolation = node.interpolation || "linear";
      if (!["linear", "constant", "ease"].includes(interpolation))
        throw new Error(
          `Unsupported Color Ramp interpolation: ${interpolation}`,
        );
      const stops = [...node.stops].sort(
        (first, second) => first.position - second.position,
      );
      const kind = socket === "color" ? "vec3" : "float";
      const color = (stop) =>
        constant(
          socket === "color" ? stop.color.slice(0, 3) : stop.color[3],
          kind,
        );
      const factor = input(node, "factor", "float", 0.5);
      result = color(stops[0]);
      for (let index = 1; index < stops.length; index++) {
        const amount = step("rampFactor", "float", [factor.id], {
          from: stops[index - 1].position,
          to: stops[index].position,
          interpolation,
        });
        result = step("mix", kind, [
          result.id,
          color(stops[index]).id,
          amount.id,
        ]);
      }
    } else if (
      [
        "noise",
        "fractal",
        "turbulence",
        "voronoi",
        "cell",
        "checker",
        "wave",
      ].includes(node.type) &&
      ["factor", "color"].includes(socket)
    ) {
      const vector =
        node.inputs?.vector?.link || node.inputs?.vector?.value
          ? input(node, "vector", "vec3", [0, 0, 0])
          : step("position", "vec3");
      const point = step("mul", "vec3", [
        vector.id,
        input(node, "scale", "float", 5).id,
      ]);
      result = step(node.type, "float", [
        point.id,
        step("clampDetail", "float", [input(node, "detail", "float", 3).id]).id,
        step("clamp", "float", [input(node, "roughness", "float", 0.5).id]).id,
        input(node, "lacunarity", "float", 2).id,
      ]);
      if (socket === "color") result = convert(result, "vec3");
    } else if (
      node.type === "reroute" &&
      socket === "value" &&
      node.inputs?.value?.link
    ) {
      result = output(
        node.inputs.value.link.node,
        node.inputs.value.link.socket,
      );
    } else if (node.type === "math" && socket === "value") {
      const operations = {
        ADD: "add",
        SUBTRACT: "sub",
        MULTIPLY: "mul",
        MINIMUM: "min",
        MAXIMUM: "max",
      };
      if (!Object.hasOwn(operations, node.operation))
        throw new Error(
          `${node.label}: unsupported Math operation ${node.operation}.`,
        );
      result = step(operations[node.operation], "float", [
        input(node, "a", "float", 0).id,
        input(node, "b", "float", 0).id,
      ]);
      if (node.clamp) result = step("clamp", "float", [result.id]);
    } else if (
      node.type === "mix" &&
      socket === "color" &&
      node.operation === "MIX"
    ) {
      result = step("mix", "vec3", [
        input(node, "a", "vec3", [0, 0, 0]).id,
        input(node, "b", "vec3", [1, 1, 1]).id,
        step("clamp", "float", [input(node, "factor", "float", 0.5).id]).id,
      ]);
      if (node.clamp) result = step("clamp", "vec3", [result.id]);
    } else if (node.type === "image" && ["color", "alpha"].includes(socket)) {
      if (
        typeof node.image !== "string" ||
        node.image.length > 32 * 1024 * 1024 ||
        !/^data:image\/(png|ktx2);base64,[A-Za-z0-9+/=]+$/.test(node.image)
      )
        throw new Error(
          `${node.label}: expected an embedded PNG or KTX2 image (at most 32 MB).`,
        );
      if (
        !["srgb", "linear"].includes(node.colorSpace) ||
        !["repeat", "extend"].includes(node.extension) ||
        !["linear", "closest"].includes(node.interpolation)
      )
        throw new Error(`${node.label}: unsupported image settings.`);
      const coordinates = node.inputs?.vector
        ? input(node, "vector", "vec3", [0, 0, 0])
        : step("uv", "vec3");
      const sample = step("image", "vec4", [coordinates.id], {
        image: node.image,
        colorSpace: node.colorSpace,
        extension: node.extension,
        interpolation: node.interpolation,
      });
      result = step(
        socket === "color" ? "rgb" : "alpha",
        socket === "color" ? "vec3" : "float",
        [sample.id],
      );
    } else {
      throw new Error(
        `${node.label || id}: unsupported node or output (${node.type}.${socket}). Bake this branch in Blender.`,
      );
    }
    visiting.delete(key);
    cache.set(key, result);
    return result;
  };
  const terminal = nodes.get(graph.output);
  const surface = terminal?.inputs?.surface?.link;
  const principled = surface && nodes.get(surface.node);
  if (
    terminal?.type !== "output" ||
    surface?.socket !== "shader" ||
    principled?.type !== "principled"
  )
    throw new Error(
      "Connect one Principled BSDF directly to Material Output Surface.",
    );
  if (terminal.errors?.length) throw new Error(terminal.errors.join("; "));
  if (principled.errors?.length) throw new Error(principled.errors.join("; "));
  const outputs = {};
  for (const [name, kind, fallback] of [
    ["color", "vec3", [0.8, 0.8, 0.8]],
    ["metalness", "float", 0],
    ["roughness", "float", 0.5],
    ["ior", "float", 1.5],
    ["alpha", "float", 1],
    ["emission", "vec3", [0, 0, 0]],
    ["emissionStrength", "float", 1],
  ])
    outputs[name] = input(principled, name, kind, fallback).id;
  for (const [name, [, kind, fallback]] of Object.entries(physicalInputs)) {
    const socket = principled.inputs?.[name];
    if (
      socket?.link ||
      (socket?.value !== undefined &&
        JSON.stringify(socket.value) !== JSON.stringify(fallback))
    )
      outputs[name] = input(principled, name, kind, fallback).id;
  }
  if (principled.inputs?.normal?.link)
    outputs.normal = input(principled, "normal", "vec3", [0, 0, 1]).id;
  visited.add(terminal.id);
  visited.add(principled.id);
  return {
    transparent:
      typeof graph.transparent === "boolean" ? graph.transparent : null,
    id: graph.id,
    name: String(graph.name || "Blender material"),
    steps,
    outputs,
    parameters,
    nodes: inspectMaterialGraph(graph).map((node) => ({
      ...node,
      connected: visited.has(node.id),
    })),
  };
}

export function materialModule(raw) {
  const plan = compileMaterialGraph(raw);
  const lines = [
    "import { MeshPhysicalNodeMaterial, TextureLoader, SRGBColorSpace, NoColorSpace, RepeatWrapping, ClampToEdgeWrapping, NearestFilter, LinearFilter, NearestMipmapNearestFilter, LinearMipmapLinearFilter, type Texture } from 'three/webgpu';",
    "import * as TSL from 'three/tsl';",
    `const materialUtility: (TSL: typeof import('three/tsl'), operation: string, args: any[]) => any = ${materialUtility.toString()};`,
    "export async function createMaterial(options: { loadKTX2?: (url: string) => Promise<Texture> } = {}) {",
    "  const textures: Texture[] = [];",
    "  try {",
  ];
  for (const entry of plan.steps) {
    const args = entry.args;
    let expression;
    switch (entry.op) {
      case "float":
      case "uniform":
        expression = `TSL.${entry.op}(${JSON.stringify(entry.value)})`;
        break;
      case "vec3":
        expression = `TSL.vec3(${entry.value.join(", ")})`;
        break;
      case "splat":
        expression = `TSL.vec3(${args[0]})`;
        break;
      case "luminance":
        expression = `TSL.dot(${args[0]}, TSL.vec3(0.2126, 0.7152, 0.0722))`;
        break;
      case "uv":
        expression = "TSL.vec3(TSL.uv().x, TSL.uv().y.oneMinus(), 0)";
        break;
      case "position":
        expression = "TSL.positionLocal";
        break;
      case "normalView":
        expression = "TSL.normalView";
        break;
      case "time_seconds":
        expression = `TSL.time.mul(${args[0]}).add(${args[1]})`;
        break;
      case "time_delta":
        expression = "TSL.deltaTime";
        break;
      case "time_frame":
        expression = "TSL.float(TSL.frameId)";
        break;
      case "screen_uv":
        expression = "TSL.vec3(TSL.screenUV.x, TSL.screenUV.y.oneMinus(), 0)";
        break;
      case "screen_x":
        expression = "TSL.screenUV.x";
        break;
      case "screen_y":
        expression = "TSL.screenUV.y.oneMinus()";
        break;
      case "screen_pixels":
        expression =
          "TSL.vec3(TSL.screenCoordinate.x, TSL.screenSize.y.sub(TSL.screenCoordinate.y), 0)";
        break;
      case "screen_resolution":
        expression = "TSL.vec3(TSL.screenSize, 0)";
        break;
      case "rampFactor": {
        expression =
          entry.interpolation === "constant" || entry.from === entry.to
            ? `TSL.step(${entry.to}, ${args[0]})`
            : `${args[0]}.sub(${entry.from}).div(${entry.to - entry.from}).clamp()`;
        if (entry.interpolation === "ease" && entry.from !== entry.to)
          expression = `TSL.smoothstep(0, 1, ${expression})`;
        break;
      }
      case "clampDetail":
        expression = `${args[0]}.clamp(1, 8).floor()`;
        break;
      case "noise":
        expression = `TSL.mx_noise_float(${args[0]}).mul(0.5).add(0.5).clamp()`;
        break;
      case "fractal":
        expression = `TSL.mx_fractal_noise_float(${args[0]}, ${args[1]}, ${args[3]}.clamp(1, 4), ${args[2]}).mul(0.5).add(0.5).clamp()`;
        break;
      case "turbulence":
        expression = `TSL.mx_fractal_noise_float(${args[0]}, ${args[1]}, ${args[3]}.clamp(1, 4), ${args[2]}).abs().clamp()`;
        break;
      case "voronoi":
        expression = `TSL.mx_worley_noise_float(${args[0]}).clamp()`;
        break;
      case "cell":
        expression = `TSL.mx_cell_noise_float(${args[0]})`;
        break;
      case "checker":
        expression = `${args[0]}.floor().dot(TSL.vec3(1)).mod(2).abs()`;
        break;
      case "wave":
        expression = `${args[0]}.x.mul(6.28318530718).sin().mul(0.5).add(0.5)`;
        break;
      case "image": {
        const image = `image_${entry.id}`;
        const compressed = entry.image.startsWith("data:image/ktx2;");
        if (compressed)
          lines.push(
            "    if (!options.loadKTX2) throw new Error('KTX2 textures require options.loadKTX2; pass a configured KTX2Loader.loadAsync callback.');",
          );
        lines.push(
          `    const ${image} = await ${compressed ? "options.loadKTX2" : "new TextureLoader().loadAsync"}(${JSON.stringify(entry.image)});`,
          `    textures.push(${image});`,
          `    ${image}.flipY = false;`,
          `    ${image}.colorSpace = ${entry.colorSpace === "srgb" ? "SRGBColorSpace" : "NoColorSpace"};`,
          `    ${image}.wrapS = ${image}.wrapT = ${entry.extension === "repeat" ? "RepeatWrapping" : "ClampToEdgeWrapping"};`,
          `    ${image}.magFilter = ${entry.interpolation === "closest" ? "NearestFilter" : "LinearFilter"};`,
          `    ${image}.minFilter = ${compressed ? `${image}.mipmaps.length > 1 ? ${entry.interpolation === "closest" ? "NearestMipmapNearestFilter" : "LinearMipmapLinearFilter"} : ${image}.magFilter` : `${image}.magFilter`};`,
          `    ${image}.generateMipmaps = false;`,
        );
        expression = `TSL.texture(${image}, TSL.vec2(${args[0]}.x, ${args[0]}.y.oneMinus()))`;
        break;
      }
      case "rgb":
        expression = `${args[0]}.rgb`;
        break;
      case "alpha":
        expression = `${args[0]}.a`;
        break;
      case "clamp":
        expression = `${args[0]}.clamp(0, 1)`;
        break;
      case "mix":
        expression = `TSL.mix(${args.join(", ")})`;
        break;
      default:
        expression = /^(mapping_|vector_|map_|bump$|normalMap$)/.test(entry.op)
          ? `materialUtility(TSL, ${JSON.stringify(entry.op)}, [${args.join(", ")}])`
          : `${args[0]}.${entry.op}(${args[1]})`;
    }
    lines.push(`    const ${entry.id} = ${expression};`);
  }
  lines.push(
    "    const material = new MeshPhysicalNodeMaterial();",
    `    material.name = ${JSON.stringify(plan.name)};`,
    `    material.transparent = ${plan.transparent === true};`,
  );
  for (const [property, output] of Object.entries({
    colorNode: "color",
    roughnessNode: "roughness",
    metalnessNode: "metalness",
    iorNode: "ior",
    opacityNode: "alpha",
  }))
    lines.push(`    material.${property} = ${plan.outputs[output]};`);
  if (plan.outputs.normal)
    lines.push(`    material.normalNode = ${plan.outputs.normal};`);
  for (const [name, [property]] of Object.entries(physicalInputs))
    if (plan.outputs[name])
      lines.push(`    material.${property} = ${plan.outputs[name]};`);
  lines.push(
    `    material.emissiveNode = ${plan.outputs.emission}.mul(${plan.outputs.emissionStrength});`,
    `    return { material, parameters: { ${plan.parameters.map((parameter) => `${parameter.id}: ${parameter.id}`).join(", ")} }, dispose() { material.dispose(); textures.forEach(texture => texture.dispose()); } };`,
    "  } catch (error) { textures.forEach(texture => texture.dispose()); throw error; }",
    "}",
  );
  return lines.join("\n") + "\n";
}
