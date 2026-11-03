# GLB Viewer

A local-first Mac app for preparing Blender assets for Three.js.

- [Download the latest release](https://github.com/cullenwebber/glb-viewer/releases/latest) — Apple Silicon and Intel.
- Open the DMG and drag **GLB Viewer** into Applications.
- [User guide](docs/user-guide.md) · [Release setup](docs/releasing.md) · [Builds](https://github.com/cullenwebber/glb-viewer/actions)

## Features

- GLB/glTF preview, scene selection, mesh isolation, and animation playback.
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

## Development

- Requires Node.js 22.12+ and npm.
- Install: `npm ci`
- Run: `npm run desktop`
- Hot reload: `npm run desktop:dev`
- Test: `npm test`
- Package: `npm run package:mac`
- Build DMG/ZIP: `npm run dist:mac`
- Built with Electron, React, Three.js, and [shadcn/ui](https://ui.shadcn.com/).

## Releases and updates

- Version tags trigger tested Apple Silicon and Intel release builds.
- In-app update checks find new GitHub releases.
- Unsigned builds use manual installation; automatic installation requires Apple signing credentials.
- Presets, budgets, and history survive app updates.
