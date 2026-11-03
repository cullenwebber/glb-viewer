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
    const loader = `import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export async function loadModel(renderer: THREE.WebGLRenderer, url = '/models/${base}/model.glb', decoderPath = '/models/${base}/decoders/') {
  const draco = new DRACOLoader().setDecoderPath(new URL('draco/', new URL(decoderPath, window.location.href)).href);
  const ktx2 = new KTX2Loader().setTranscoderPath(new URL('basis/', new URL(decoderPath, window.location.href)).href).detectSupport(renderer);
  const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url).catch(error => { draco.dispose(); ktx2.dispose(); throw error; });
  const mixer = new THREE.AnimationMixer(gltf.scene);
  return {
    gltf, mixer,
    // Call mixer.update(deltaSeconds) in your render loop after starting a clip.
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
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
export async function loadLOD(renderer: THREE.WebGLRenderer, levels: { url: string; distance: number }[]) {
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
