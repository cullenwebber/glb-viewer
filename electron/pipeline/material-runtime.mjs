import {
  MeshPhysicalNodeMaterial,
  TextureLoader,
  RepeatWrapping,
  ClampToEdgeWrapping,
  NearestFilter,
  LinearFilter,
  NearestMipmapNearestFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  NoColorSpace,
} from "three/webgpu";
import { float, vec3, vec2, uniform, uv, texture, mix, dot } from "three/tsl";
import * as TSL from "three/tsl";
import {
  BRIDGE_KEY,
  compileMaterialGraph,
  inspectMaterialGraph,
  physicalInputs,
  materialUtility,
} from "./material-graph.mjs";

export async function applyBridgeMaterials(root, options = {}) {
  const replacements = new Map(),
    reports = [],
    ownedTextures = new Set(),
    ownedMaterials = new Set(),
    uniforms = new Map();
  const originals = new Map();
  const build = async (source) => {
    let plan;
    try {
      plan = compileMaterialGraph(source.userData[BRIDGE_KEY]);
      const values = new Map(),
        textures = new Map();
      for (const entry of plan.steps) {
        const args = entry.args.map((id) => values.get(id));
        let result;
        switch (entry.op) {
          case "float":
            result = float(entry.value);
            break;
          case "vec3":
            result = vec3(...entry.value);
            break;
          case "uniform":
            result = uniform(entry.value);
            uniforms.set(`${source.uuid}:${entry.id}`, result);
            break;
          case "splat":
            result = vec3(args[0]);
            break;
          case "luminance":
            result = dot(args[0], vec3(0.2126, 0.7152, 0.0722));
            break;
          case "uv":
            result = vec3(uv().x, uv().y.oneMinus(), 0);
            break;
          case "position":
            result = TSL.positionLocal;
            break;
          case "normalView":
            result = TSL.normalView;
            break;
          case "time_seconds":
            result = TSL.time.mul(args[0]).add(args[1]);
            break;
          case "time_delta":
            result = TSL.deltaTime;
            break;
          case "time_frame":
            result = float(TSL.frameId);
            break;
          case "screen_uv":
            result = vec3(TSL.screenUV.x, TSL.screenUV.y.oneMinus(), 0);
            break;
          case "screen_x":
            result = TSL.screenUV.x;
            break;
          case "screen_y":
            result = TSL.screenUV.y.oneMinus();
            break;
          case "screen_pixels":
            result = vec3(
              TSL.screenCoordinate.x,
              TSL.screenSize.y.sub(TSL.screenCoordinate.y),
              0,
            );
            break;
          case "screen_resolution":
            result = vec3(TSL.screenSize, 0);
            break;
          case "rampFactor": {
            result =
              entry.interpolation === "constant" || entry.from === entry.to
                ? TSL.step(entry.to, args[0])
                : args[0]
                    .sub(entry.from)
                    .div(entry.to - entry.from)
                    .clamp();
            if (entry.interpolation === "ease" && entry.from !== entry.to)
              result = TSL.smoothstep(0, 1, result);
            break;
          }
          case "clampDetail":
            result = args[0].clamp(1, 8).floor();
            break;
          case "noise":
            result = TSL.mx_noise_float(args[0]).mul(0.5).add(0.5).clamp();
            break;
          case "fractal":
            result = TSL.mx_fractal_noise_float(
              args[0],
              args[1],
              args[3].clamp(1, 4),
              args[2],
            )
              .mul(0.5)
              .add(0.5)
              .clamp();
            break;
          case "turbulence":
            result = TSL.mx_fractal_noise_float(
              args[0],
              args[1],
              args[3].clamp(1, 4),
              args[2],
            )
              .abs()
              .clamp();
            break;
          case "voronoi":
            result = TSL.mx_worley_noise_float(args[0]).clamp();
            break;
          case "cell":
            result = TSL.mx_cell_noise_float(args[0]);
            break;
          case "checker":
            result = args[0].floor().dot(vec3(1)).mod(2).abs();
            break;
          case "wave":
            result = args[0].x.mul(6.28318530718).sin().mul(0.5).add(0.5);
            break;
          case "image": {
            const key = `${entry.sourceTexture || entry.image}:${entry.colorSpace}:${entry.extension}:${entry.interpolation}`;
            let image = textures.get(key);
            if (!image) {
              const compressed = entry.image?.startsWith("data:image/ktx2;");
              if (compressed && !options.loadKTX2)
                throw new Error(
                  "KTX2 textures require a configured loadKTX2 callback.",
                );
              if (entry.sourceTexture) {
                if (!options.resolveTexture)
                  throw new Error(
                    "Model textures require a resolveTexture callback.",
                  );
                const original = await options.resolveTexture(
                  entry.sourceTexture,
                );
                if (!original?.isTexture)
                  throw new Error(
                    `Model texture is unavailable: ${entry.sourceTexture}`,
                  );
                image = original.clone();
              } else
                image = await (compressed
                  ? options.loadKTX2(entry.image)
                  : new TextureLoader().loadAsync(entry.image));
              if (!entry.sourceTexture) image.flipY = false;
              image.colorSpace =
                entry.colorSpace === "srgb" ? SRGBColorSpace : NoColorSpace;
              if (entry.extension !== "source")
                image.wrapS = image.wrapT =
                  entry.extension === "repeat"
                    ? RepeatWrapping
                    : ClampToEdgeWrapping;
              if (entry.interpolation !== "source") {
                image.magFilter =
                  entry.interpolation === "closest"
                    ? NearestFilter
                    : LinearFilter;
                image.minFilter =
                  compressed && image.mipmaps.length > 1
                    ? entry.interpolation === "closest"
                      ? NearestMipmapNearestFilter
                      : LinearMipmapLinearFilter
                    : image.magFilter;
                image.generateMipmaps = false;
              }
              ownedTextures.add(image);
              textures.set(key, image);
            }
            result = entry.nativeCoordinates
              ? texture(image)
              : texture(image, vec2(args[0].x, args[0].y.oneMinus()));
            break;
          }
          case "rgb":
            result = args[0].rgb;
            break;
          case "alpha":
            result = args[0].a;
            break;
          case "channel_red":
          case "channel_green":
          case "channel_blue":
            result =
              args[0][
                entry.op === "channel_red"
                  ? "r"
                  : entry.op === "channel_green"
                    ? "g"
                    : "b"
              ];
            break;
          case "add":
          case "sub":
          case "mul":
          case "min":
          case "max":
            result = args[0][entry.op](args[1]);
            break;
          case "clamp":
            result = args[0].clamp(0, 1);
            break;
          case "mix":
            result = mix(args[0], args[1], args[2]);
            break;
          default:
            result = materialUtility(TSL, entry.op, args);
        }
        values.set(entry.id, result);
      }
      const material = new MeshPhysicalNodeMaterial();
      material.name = source.name;
      material.userData = { ...source.userData };
      material.side = source.side;
      material.transparent = plan.transparent ?? source.transparent;
      material.alphaTest = source.alphaTest;
      material.depthWrite = source.depthWrite;
      material.vertexColors = source.vertexColors;
      material.flatShading = source.flatShading ?? false;
      if (plan.renderSettings) Object.assign(material, plan.renderSettings);
      const outputs = Object.fromEntries(
        Object.entries(plan.outputs).map(([name, id]) => [
          name,
          values.get(id),
        ]),
      );
      material.colorNode = outputs.color;
      if (outputs.normal) material.normalNode = outputs.normal;
      material.metalnessNode = outputs.metalness;
      material.roughnessNode = outputs.roughness;
      material.iorNode = outputs.ior;
      material.opacityNode = outputs.alpha;
      material.emissiveNode = outputs.emission.mul(outputs.emissionStrength);
      for (const [name, [property]] of Object.entries(physicalInputs))
        if (outputs[name]) material[property] = outputs[name];
      ownedMaterials.add(material);
      reports.push({
        key: source.uuid,
        id: plan.id,
        name: plan.name,
        status: "translated",
        message:
          "Principled approximation in TSL; lighting may differ from Blender.",
        nodes: plan.nodes,
        parameters: plan.parameters,
      });
      return material;
    } catch (error) {
      let nodes = [];
      try {
        nodes = inspectMaterialGraph(source.userData[BRIDGE_KEY]);
      } catch {}
      reports.push({
        key: source.uuid,
        id: plan?.id || source.uuid,
        name: source.name || "Blender material",
        status: "fallback",
        message: String(error.message || error),
        nodes,
        parameters: [],
      });
      return source;
    }
  };
  const sources = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      if (Object.hasOwn(material.userData, BRIDGE_KEY)) sources.add(material);
  });
  for (const source of sources) replacements.set(source, await build(source));
  root.traverse((object) => {
    if (!object.isMesh) return;
    originals.set(object, object.material);
    const replace = (material) => replacements.get(material) || material;
    object.material = Array.isArray(object.material)
      ? object.material.map(replace)
      : replace(object.material);
  });
  return {
    reports,
    setParameter(key, id, value) {
      const parameter = uniforms.get(`${key}:${id}`);
      if (!parameter || !Number.isFinite(value)) return;
      parameter.value = value;
    },
    dispose() {
      for (const [object, material] of originals) object.material = material;
      originals.clear();
      ownedMaterials.forEach((material) => material.dispose());
      ownedTextures.forEach((image) => image.dispose());
      ownedMaterials.clear();
      ownedTextures.clear();
      uniforms.clear();
    },
  };
}
