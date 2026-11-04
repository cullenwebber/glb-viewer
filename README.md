# GLB Viewer

A local-first Mac app for preparing Blender assets for Three.js.

- [Download the latest release](https://github.com/cullenwebber/glb-viewer/releases/latest) — Apple Silicon and Intel.
- Open the DMG and drag **GLB Viewer** into Applications.
- [User guide](docs/user-guide.md) · [Release setup](docs/releasing.md) · [Builds](https://github.com/cullenwebber/glb-viewer/actions)

## Features

- Labelled tool navigation and draggable panel widths.

- GLB/glTF preview, scene selection, mesh isolation, and animation playback.
- WebGPU rendering with Three.js's WebGL 2 fallback backend.
- A Materials node workspace with live TSL previews, socket wiring, undo/redo, and graph/TypeScript exports.
- A Blender add-on for atomic, watched exports with embedded material graphs.
- Procedural noise nodes and physical glass/coat/sheen inputs, plus imported camera views and scene-light helpers.
- Vertex/face normals, bones, bone weights, face orientation, and cost heatmaps.
- Material solo views, UV checker, and UV layout inspection.
- Texture pan/zoom, channel debugging, individual resizing, and channel packing.
- Draco/Meshopt geometry compression and KTX2, WebP, PNG, or JPEG textures.
- Per-mesh simplification, cleanup, instancing, and LOD exports.
- glTF validation with actionable fixes and output rechecking.
- Linked before/after comparison, saved run history, presets, and project budgets.
- Folder batch processing and automatic Blender re-export watching.
- Three.js bundles with decoders, typed lookups, and a React Three Fiber component.
- Actual before/after file sizes, draw calls, load timings, and memory estimates.
- Models stay local; source files are preserved.

## Blender and material nodes

Download the Blender add-on from **Export → Blender bridge**, or build it with `npm run build` to create `dist/glb-viewer-bridge.zip`. Install the ZIP in Blender 4.2+, open the **GLB Viewer** sidebar, choose an output folder, and click **Send to GLB Viewer**. Open its `model.glb` here once and enable **Watch exports**. Blender can also export automatically after saving the `.blend` file.

Open **Materials** to add and connect supported nodes, edit values and image textures, and preview them on a selected material. **Save graph** creates an editable JSON file; **Export TSL** creates a standalone Three.js material factory. Editor drafts last for this session and are exported separately, not baked into optimized GLBs. Unsupported Blender graphs retain glTF fallback materials with diagnostics. This is a supported-node translator, not full Cycles parity or two-way Blender synchronization.

See [Blender bridge and node editor](docs/blender-bridge.md) for supported nodes, shortcuts, and integration.

## Development

- Requires Node.js 22.12+ and npm.
- Install: `npm ci`
- Run: `npm run desktop`
- Hot reload: `npm run desktop:dev`
- Test: `npm test`
- Blender integration: `npm run test:blender` (set `BLENDER` if needed; add `BLENDER_UI_TEST=1` to exercise real Blender exports in the app after a build).
- Package: `npm run package:mac`
- Build DMG/ZIP: `npm run dist:mac`
- Built with Electron, React, Three.js, and [shadcn/ui](https://ui.shadcn.com/).

## Releases and updates

- Version tags trigger tested Apple Silicon and Intel release builds.
- In-app update checks find new GitHub releases.
- Unsigned builds use manual installation; automatic installation requires Apple signing credentials.
- Presets, budgets, and history survive app updates.
