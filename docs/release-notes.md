## GLB Viewer 1.1.0

A local-first Mac workspace for preparing Blender assets for Three.js.

### Inspection

- Linked original/optimized comparison with synchronized cameras and animation.
- Material solo views: base color, roughness, metalness, ambient occlusion, alpha, and geometry normals.
- UV checker and pan/zoom UV layout with UV-set selection and raster base-color backgrounds.
- Face orientation, animated normal overlays, bones/joints, and selectable bone-weight heatmaps.
- Per-mesh cost heatmaps for triangles, material slots, and texture memory estimates.

### Optimization and delivery

- Persistent named optimization history, snapshot restoration, and run-to-run comparison.
- Named project budgets for model size, triangles, texture memory, and draw calls.
- Folder batch processing with preset matching, per-file validation, budget flags, cancellation, and JSON reports.
- Three.js exports now include typed object/animation lookups and an optional React Three Fiber component.
- Existing Draco/Meshopt, per-texture resize/encoding, KTX2, channel packing, validation fixes, and Blender export watching remain available.

### Downloads and updates

Choose **arm64** for Apple Silicon or **x64** for Intel. Open the DMG and copy GLB Viewer to Applications.

These initial release builds are **unsigned** unless the repository's Apple signing credentials have been configured. macOS may block an unsigned download. In-app update checks link to the latest release; signed builds additionally support downloading and installing an update after confirmation. Presets and history are retained when replacing the application.

Rendering measurements describe the current device and view. Memory and batch draw-call values are estimates. Review optimized assets visually before using them in production.
