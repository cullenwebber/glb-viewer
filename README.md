<img src="assets/icon.svg" width="64" height="64" alt="GLB Viewer icon">

# GLB Viewer

A macOS desktop viewer for checking GLB and glTF assets before using them in Three.js. Built with Electron, React, TypeScript, Three.js, and [shadcn/ui](https://ui.shadcn.com/). Models and their resources stay local; decoders and the studio environment are bundled for offline use.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run desktop
```

For development with hot reload, run `npm run desktop:dev`. `npm run dev` starts the browser version at http://127.0.0.1:5173.

## Use

- Open a `.glb` or `.gltf` using **Open model**, **⌘O**, drag and drop, or Finder’s **Open With → GLB Viewer** after installing the app.
- Keep a glTF file’s buffers and textures inside its directory or subdirectories. Relative paths are preserved. Network resources and resources outside the selected model directory are blocked.
- Drag to orbit, scroll to zoom, and right drag to pan. Select any mesh or object in the scene tree to frame and highlight it; **F** frames the selection. **Escape** or **Clear selection** restores its original materials. Live model and viewport draw-call counts appear in the inspector; the viewport total includes the grid and selection bounds.
- Inspect the scene hierarchy, triangle and vertex counts, meshes, materials, textures, and dimensions. Dimensions use glTF’s meter convention; animated bounds reflect the pose at load time. Counts describe the loaded scene, rather than a performance budget or glTF validation report.
- Use the animation picker, play/pause button, scrubber, and playback speed controls. **Space** toggles playback. Clips loop.
- Adjust wireframe, grid, background, studio/ambient/directional lighting, exposure, and auto rotation.
- In **Geometry inspection**, show blue vertex normals or amber face normals, adjust their length relative to the model, and filter them to a selected object. Up to 5,000 normals are sampled on dense assets. Vertex normals follow skinning and morph targets; face normals follow the deformed triangles. Show bone connections during animation and scrubbing, with an optional in-front mode for both overlays. These helpers affect only the viewport and its draw-call total; they are excluded from the asset, model draw calls, and exports.
- Save a PNG of the viewport or copy a Three.js loader snippet. Move your model and any external resources into your Three.js project’s public directory; copy the bundled decoders into that project too.

The initial knot sculpture is a procedural demo. Opening a file replaces it. Draco, Meshopt, and KTX2 compression are supported. Other format extensions depend on Three.js GLTFLoader support.

In the browser version, select a GLB or select the glTF plus its resources together. For nested resources, drop the complete model folder. If a dropped folder contains several models, the first discovered model opens.

## Texture workbench

Use the **Textures**, **Channel packing**, and **Size report** tabs in the main workspace. The **Optimize** action opens the size report and export controls.

- Inspect every embedded or referenced image, including unassigned images. Sort by encoded size, inspect material slots, UVs, samplers, dimensions, and color/data roles.
- View RGBA, RGB, or individual R/G/B/A channels, flip Y, and inspect sampled pixel values. Scroll to zoom around the pointer, drag to pan, enter a zoom percentage, or use the zoom buttons. Double-click or press **Fit** to reset the texture view. PNG/JPEG/WebP/AVIF and KTX2 previews are supported; the debugger preview is capped at 2048 pixels.
- Set each image’s maximum resolution and output encoding separately. For example, keep a base-color image at 4096 px and resize a roughness/metalness image to 1024 px. Shared images affect all their material references. Resizing preserves aspect ratio and never upscales.
- Choose PNG, JPEG, WebP, or KTX2 with ETC1S/UASTC. Configure PNG compression level, JPEG/WebP quality, WebP effort and lossless mode, ETC1S quality and effort, UASTC effort and RDO strength, and optional mipmaps per image or packing recipe. JPEG conversion rejects transparency. KTX2 preserves color/data transfer metadata and requires dimensions divisible by four. Existing KTX2 images can be inspected and preserved; reimport original raster images to resize or pack them.
- Create channel-packing recipes using model images or **Import texture files**. Choose any source channel or an 8-bit constant for each output channel. The ORM preset uses R = occlusion, G = roughness, and B = metalness. Bind a recipe to a material’s ORM, base-color, emissive, or normal slot. Sources are resampled to the chosen square resolution. Material factors and existing UV/sampler settings are retained; mismatched ORM UVs, transforms, or samplers are rejected. Imported files are packing inputs and enter the output model only through a recipe.
- Compress geometry with Draco or Meshopt, independently of texture choices. Use the settings button beside Geometry to adjust Draco position/normal/UV precision and encode/decode speed, or select Meshopt medium/high compression. Every run starts from the original document, avoiding cumulative lossy recompression.
- Compare actual source and output bytes for the full model and individual images. Model input size includes unique referenced external files. Texture rows describe encoded payload, not GPU memory. Duplicate references can appear in multiple image rows; the geometry/container remainder includes JSON, padding, and animation data.
- Preview the optimized model in Three.js, switch back to the original, then export a new self-contained GLB. Download individual displayed textures or the JSON size report. The original model is never overwritten.

Optimization runs in a background worker in the Mac app, and can be cancelled. All encoders are bundled; no system `toktx` installation or online service is required. Models using extensions unsupported by glTF Transform remain viewable but cannot be optimized safely.

## Blender to Three.js workflow

- **Checks** runs the official glTF Validator and checks transforms, normals, texture UV sets, and required extension support. Filter issues by severity, jump to affected objects, or export the validation report. Choose source or optimized output for validation. For unused UVs, queue unused-attribute cleanup; for double-sided materials, queue per-primitive single-sided fixes. Run optimization, review backface appearance, then validate the optimized output. Shared materials are isolated so other primitives keep their intended backface rendering. The original remains intact.
- **Performance** shows live frame intervals, CPU render submission time, model draw calls, per-mesh costs, geometry and texture memory estimates, and source-read, decode, compilation, and first-render timings. Frame or isolate individual meshes. Temporarily disable transparency, transmission, or shadows and adjust pixel ratio to compare rendering costs. These experiments do not change exported materials. Memory is estimated; CPU timings are not GPU timings or predictions for another device.
- **Geometry** adds global and per-mesh simplification targets, maximum error, border locking, and protected meshes. Optional cleanup deduplicates resources, prunes unused data, removes unused attributes, or resamples animation. Joining compatible meshes and instancing repeated meshes can reduce draw calls. Named objects are preserved by default; review application references before changing that setting. Instancing is skipped for animated models, and simplification skips skinned and morph-target meshes.
- Generate additional **LOD exports** at lower triangle targets. Error limits can prevent reaching a requested target, and protected meshes retain their geometry. LOD files are included in the Three.js bundle; choose switching distances and animation synchronization in your application.
- Enable **Watch** after opening a model to reload stable Blender re-exports, including atomic file replacements and changes to referenced resources. The camera and optimization recipe are retained. Export into the same location to keep the loop running.
- **Presets** saves named recipes locally, with rename, delete, and JSON import/export. Recipes include compression, geometry, texture rules, and channel packing. Matching uses texture identities, material names, and unambiguous texture roles rather than numeric indices. Missing or ambiguous matches are reported. Presets store rules rather than image binaries; reimport external packing inputs when unavailable. Each source also restores its last recipe automatically.
- **Export** saves either a self-contained optimized GLB or a complete Three.js bundle containing the model, generated LODs, offline decoders, a TypeScript loader with animation/disposal helpers, asset metadata, and the optimization report. Its README explains where to copy the assets and how to configure URLs. Export requires a successful optimization with current settings.

## Code organization

- `src/components/ui/`: official shadcn/ui components, configured by `components.json`.
- `src/components/layout/`: app header, scene sidebar, keyboard help.
- `src/components/viewer/`: viewport, playback, model details, display and lighting controls.
- `src/components/workbench/`: image library, pixel debugger, texture properties, packing editor, size report, and workspace.
- `src/components/checks/`, `performance/`, `presets/`, and `export/`: validation, rendering diagnostics, recipe library, and bundle export.
- `src/hooks/`: viewer lifecycle and workbench state/actions.
- `src/viewer/`: Three.js rendering and file resolution, independent of React components.
- `electron/`: local file permissions, background optimization and export.
- `electron/pipeline/`: validation, geometry transforms, persistent recipes, file watching, and Three.js bundle generation.

The UI uses sentence-case labels, tight `-0.02em` letter spacing, and shadcn’s shared theme tokens. Its workspace-first layout, neutral surfaces, white primary actions, compact property rows, and persistent tabs are described in `docs/design-direction.md`.

## Build a Mac app

```sh
npm run package:mac  # release/mac-arm64/GLB Viewer.app on Apple Silicon
npm run dist:mac     # creates a DMG in release/
```

Builds target the current Mac’s architecture. Use `npx electron-builder --mac --arm64 --x64` after `npm run build` to build both architectures. Local builds are unsigned unless a Developer ID signing identity is configured. Distribution outside your Mac needs signing and notarization.

## Verify

```sh
npm test
```

Builds and type-checks the renderer, tests the optimization engine with round-trip decoding and pixel checks, then runs Electron integration tests for the viewer and workbench. Coverage includes external resources, per-texture resizing, Draco/Meshopt, ETC1S/UASTC color metadata and mipmaps, channel packing, imported maps, size accounting, native export, optimized Three.js previews, and error recovery. Tests create temporary fixtures and remove them afterward.

Pipeline tests also cover validation, simplification and protected meshes, LOD decoding, instancing, animation cleanup, recipe matching across reordered assets, persistent presets, complete export bundles, and atomic Blender re-exports with recipe restoration across app restarts. Set `SMOKE_APP_PATH` to the packaged app's executable to run Electron integration tests against a release build.

## Three.js example

```js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const gltf = await new GLTFLoader().loadAsync("/models/model.glb");
scene.add(gltf.scene);
```

For compressed assets, use the viewer’s **Copy loader snippet** action to include Draco, KTX2, and Meshopt setup. Set the KTX2 loader’s renderer to your own WebGLRenderer.

References: [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader), [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).
