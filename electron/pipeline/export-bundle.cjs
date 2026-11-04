const fs = require("node:fs/promises");
const path = require("node:path");
const { handoffFiles } = require("./handoff.cjs");
const { randomUUID } = require("node:crypto");
async function exportBundle(parent, modelName, data, decoderRoot) {
  if (!data.bytes) throw new Error("Run optimization first.");
  const base =
    modelName
      .replace(/\.(glb|gltf)$/i, "")
      .replace(/[^\w.-]/g, "-")
      .slice(0, 80) || "model";
  const directory = path.join(
    parent,
    base + "-threejs-" + randomUUID().slice(0, 8),
  );
  await fs.mkdir(directory, { recursive: false });
  try {
    await fs.writeFile(path.join(directory, "model.glb"), data.bytes);
    for (const lod of data.lods || [])
      await fs.writeFile(path.join(directory, lod.name), lod.bytes);
    for (const folder of ["draco", "basis"]) {
      await fs.mkdir(path.join(directory, "decoders", folder), {
        recursive: true,
      });
      for (const file of await fs.readdir(path.join(decoderRoot, folder))) {
        const source = path.join(decoderRoot, folder, file);
        if ((await fs.stat(source)).isFile())
          await fs.writeFile(
            path.join(directory, "decoders", folder, file),
            await fs.readFile(source),
          );
      }
    }
    const threePackage = JSON.parse(
      await fs.readFile(
        path.join(path.dirname(require.resolve("three")), "../package.json"),
        "utf8",
      ),
    );
    const bytes = Buffer.from(data.bytes),
      jsonLength = bytes.readUInt32LE(12),
      json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
    const metadata = {
      threeVersion: threePackage.version,
      model: "model.glb",
      lods: (data.lods || []).map(({ name, ratio }) => ({ file: name, ratio })),
      animations: (json.animations || []).map(
        (clip, index) => clip.name || `Animation ${index + 1}`,
      ),
      extensions: json.extensionsUsed || [],
      objects: (json.nodes || []).map((node, index) => ({
        index,
        name: node.name || null,
      })),
      boundsNote:
        "glTF uses meters. LOD switch distances are application-specific.",
    };
    await fs.writeFile(
      path.join(directory, "assets.json"),
      JSON.stringify(metadata, null, 2),
    );
    await fs.writeFile(
      path.join(directory, "optimization-report.json"),
      JSON.stringify(data.report, null, 2),
    );
    await fs.writeFile(
      path.join(directory, "package.fragment.json"),
      JSON.stringify(
        { dependencies: { three: threePackage.version } },
        null,
        2,
      ),
    );
    for (const file of [
      "material-graph.mjs",
      "material-graph.d.mts",
      "material-runtime.mjs",
      "material-runtime.d.mts",
    ])
      await fs.copyFile(path.join(__dirname, file), path.join(directory, file));
    await fs.writeFile(
      path.join(directory, "materials.ts"),
      `export { applyBridgeMaterials as applyMaterials } from './material-runtime.mjs';\nexport type { BridgeMaterials, BridgeMaterialReport } from './material-runtime.mjs';\n`,
    );
    const loader = `import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { applyMaterials } from './materials';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export async function loadModel(renderer: THREE.WebGLRenderer | WebGPURenderer, url = '/models/${base}/model.glb', decoderPath = '/models/${base}/decoders/') {
  if ('init' in renderer) await renderer.init();
  const draco = new DRACOLoader().setDecoderPath(new URL('draco/', new URL(decoderPath, window.location.href)).href);
  const ktx2 = new KTX2Loader().setTranscoderPath(new URL('basis/', new URL(decoderPath, window.location.href)).href).detectSupport(renderer);
  const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url).catch(error => { draco.dispose(); ktx2.dispose(); throw error; });
  const bridgeMaterials = 'isWebGPURenderer' in renderer ? await applyMaterials(gltf.scene, { loadKTX2: (url) => ktx2.loadAsync(url) }) : undefined;
  const mixer = new THREE.AnimationMixer(gltf.scene);
  return {
    gltf, mixer, materials: bridgeMaterials,
    // Call mixer.update(deltaSeconds) in your render loop after starting a clip.
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
      bridgeMaterials?.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        geometries.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
        if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) (mesh as THREE.SkinnedMesh).skeleton.dispose();
      });
      geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
      textures.forEach(texture => { texture.dispose(); const image = texture.source?.data; if (image instanceof ImageBitmap) image.close(); });
      gltf.scene.removeFromParent(); draco.dispose(); ktx2.dispose();
    }
  };
}

// Optional LOD loading: pass application-specific switch distances in meters.
export async function loadLOD(renderer: THREE.WebGLRenderer | WebGPURenderer, levels: { url: string; distance: number }[]) {
  const lod = new THREE.LOD(); const assets: Awaited<ReturnType<typeof loadModel>>[] = [];
  for (const level of levels) { const asset = await loadModel(renderer, level.url); assets.push(asset); lod.addLevel(asset.gltf.scene, level.distance); }
  return { lod, assets, dispose: () => { assets.forEach(asset => asset.dispose()); lod.removeFromParent(); } };
}
`;
    await fs.writeFile(path.join(directory, "load-model.ts"), loader);
    const handoff = handoffFiles(json, base);
    await fs.writeFile(path.join(directory, "model-types.ts"), handoff.types);
    await fs.writeFile(path.join(directory, "Model.tsx"), handoff.r3f);
    await fs.writeFile(
      path.join(directory, "WebGPUCanvas.tsx"),
      `import { Canvas, type CanvasProps } from '@react-three/fiber';
import { WebGPURenderer } from 'three/webgpu';
export function WebGPUCanvas({ children, ...props }: Omit<CanvasProps, 'gl'>) {
  return <Canvas {...props} gl={async defaults => {
    const renderer = new WebGPURenderer({ canvas: defaults.canvas as HTMLCanvasElement, antialias: true });
    await renderer.init();
    return renderer;
  }}>{children}</Canvas>;
}
`,
    );
    await fs.writeFile(
      path.join(directory, "package.r3f.fragment.json"),
      JSON.stringify(
        {
          dependencies: {
            three: threePackage.version,
            "@react-three/fiber": "^9.0.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
          },
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(directory, "README.md"),
      `# ${base}: Three.js export\n\nTested with Three.js ${threePackage.version}. Merge package.fragment.json into your application's dependencies, or use decoder files matching your existing Three.js version. Do not mix decoder versions.\n\nCopy model.glb, optional model-lod*.glb, and decoders/ into your project's public/models/${base}/ directory. Copy load-model.ts into your source tree. Its default URLs point to /models/${base}/model.glb and /models/${base}/decoders/. Pass explicit URL and decoderPath arguments if you use another location. Serve via HTTP or HTTPS.\n\nUse loadModel(renderer), then scene.add(asset.gltf.scene). To play a clip: asset.mixer.clipAction(asset.gltf.animations[0]).play(); update asset.mixer with delta seconds in your render loop. Call asset.dispose() on teardown. assets.json lists animation names, required extensions, objects, and LOD files.\n\nLOD files are separate assets, not a glTF LOD extension. Call loadLOD with explicit distances appropriate to your scene. Animated LODs need their mixers updated together to stay synchronized. Simplification skips skinned or morph-target meshes.\n\nLighting and tone mapping belong to your application. Configure your scene before calling renderer.compileAsync(asset.gltf.scene, camera, scene) to precompile shaders. Strict CSP applications may need dedicated decoder-worker policies for the bundled Emscripten decoders.\n\nReact Three Fiber: optionally merge package.r3f.fragment.json, copy Model.tsx, model-types.ts, and load-model.ts into your source tree, then render <Model /> inside Canvas. Pass an animation name and playing flag for playback. Each component owns its asset and disposes it on unmount; an onError callback or React error boundary can handle loading failures. model-types.ts exports typed object and animation names, getObject(), and getAnimation(). Duplicate object names are excluded from named lookups; parser node associations preserve access by index.\n\nThe original Blender export was not changed. See optimization-report.json for measured sizes and the applied recipe.\n`,
    );
    await fs.appendFile(
      path.join(directory, "README.md"),
      `\n## Blender bridge and WebGPU\n\nCopy materials.ts, material-runtime.mjs, material-runtime.d.mts, material-graph.mjs, and material-graph.d.mts alongside load-model.ts. Graphs are embedded in model.glb material extras. The loader translates supported graphs with WebGPURenderer and retains glTF fallbacks with WebGLRenderer. Inspect asset.materials?.reports for unsupported graphs; asset.materials?.setParameter(materialKey, parameterId, value) updates a Value-node uniform. dispose() restores and releases bridge resources.\n\nCreate WebGPURenderer from three/webgpu and await renderer.init() before use. Use renderer.setAnimationLoop for rendering. TSL uses WebGPURenderer, including its WebGL 2 fallback backend; it does not run on WebGLRenderer. For React Three Fiber copy WebGPUCanvas.tsx and render <WebGPUCanvas><Model /></WebGPUCanvas>; the default Canvas renderer uses glTF fallback materials.\n\nBridge v1 supports one Principled output, Value, RGB, UV/Window coordinates, Mapping (Point/Texture/Vector/Normal), supported Vector Math operations, float Map Range (Linear/Stepped/Smoothstep/Smootherstep), RGB Color Ramp (Linear/Constant/Ease), Bump, tangent-space Normal Map using the default UV set, flat PNG image textures, Mix Color (Mix), reroutes, Math Add/Subtract/Multiply/Minimum/Maximum, approximated 3D fBM Noise, and Checker Fac. Physical inputs include transmission, coat, sheen, diffuse roughness and specular controls. The editor additionally supports Perlin, absolute-fBM turbulence, Voronoi distance, cell noise, wave bands, thickness, attenuation, Screen Space coordinates, and embedded KTX2 image nodes. KTX2 material factories require a configured loadKTX2 callback; this bundle supplies one automatically. Procedural patterns and Principled lighting are approximations, not Cycles parity. Other connected features retain the full glTF fallback with diagnostics; shader mixing, object/world-space normal maps, named UV sets, volumes, displacement, and node groups still require baking. Embedded graph PNGs are separate from glTF texture compression and increase file size. Live editor drafts are exported separately and are not persisted into optimized GLBs.\n\nExported cameras are available through asset.gltf.cameras; render using the desired perspective or orthographic camera and adapt its projection to your viewport. Point, Spot and Sun lights remain in asset.gltf.scene and illuminate it when added to your scene. Area lights and Blender world shaders are not supported. Configure your own environment and tone mapping to avoid doubling imported lighting.\n`,
    );
    try {
      await fs.writeFile(
        path.join(directory, "THREE-LICENSE.txt"),
        await fs.readFile(
          path.join(path.dirname(require.resolve("three")), "../LICENSE"),
        ),
      );
    } catch {}
    return directory;
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}
module.exports = { exportBundle };
