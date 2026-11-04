# Blender bridge and Materials workspace

## Install the Blender add-on

1. In GLB Viewer, open **Export → Blender bridge → Download Blender add-on**. Development builds also produce `dist/glb-viewer-bridge.zip` after `npm run build`.
2. In Blender 4.2 or newer, use **Preferences → Add-ons → Install from Disk** to install that ZIP and enable **GLB Viewer Bridge**.
3. Open the 3D Viewport's sidebar, choose the **GLB Viewer** tab, and set an output folder. Click **Send to GLB Viewer**.
4. Open that folder's `model.glb` in this app and enable **Watch exports**. Subsequent sends reload the model without a network connection. Enable **Export after saving .blend** in Blender for a save-driven workflow.

Selected-object exports are optional. The bridge writes a temporary GLB and atomically replaces `model.glb` only after Blender finishes exporting. It does not launch GLB Viewer or establish a socket connection. The initial open and watcher activation are explicit.

### Cameras and lights

**Include scene cameras** and **Include scene lights** are enabled by default. With **Selected objects only**, these options still include all scene cameras/lights alongside the selected geometry; the original selection is restored after export.

- Perspective and orthographic cameras export into the GLB. Choose one in the viewport's **Viewport camera** selector to look through it. Orbit controls pause while viewing an imported camera; select **Orbit camera** or click **Frame** to return. The projection adapts to the viewport aspect ratio rather than reproducing Blender's render-frame crop.
- Point, Spot, and Sun lights export through `KHR_lights_punctual`. **Scene lights** switches between imported lighting and the viewer's studio/environment lighting. Hover the button for the imported light names and types.
- **Camera/light helpers** displays camera frustums, light positions, spot cones, and directional-light guides. The currently active camera's own frustum is hidden. Camera/light objects also appear in the scene hierarchy. Helpers are viewer-only and are not exported.
- Area lights, Blender world-node lighting, panoramic cameras, light linking, and Cycles-specific lighting effects do not have direct glTF equivalents. The add-on warns about Area lights rather than silently substituting point lights. Brightness and tone mapping can differ from Blender. The viewer does not edit lights or cameras back into the `.blend` file.

The bridge assigns persistent `glb_viewer_id` custom properties to local objects and materials. It temporarily adds a JSON string in each exported material's `glb_viewer_material` extras and restores any pre-existing value afterward. It does not rewrite source node trees or source image files. Linked-library materials are not modified and use normal glTF fallback export.

## Supported material translation

Bridge schema version 1 supports:

- One Principled BSDF connected directly to the active Material Output Surface.
- Principled base color, metalness, roughness, IOR, alpha, emission color, and emission strength.
- Transmission weight, coat weight/roughness, diffuse roughness, specular tint, and unlinked specular IOR level. Unlinked sheen weight/tint becomes a combined sheen color, with linked sheen roughness supported.
- Value nodes exposed as runtime uniforms, RGB color nodes, and UV texture coordinates.
- Mapping in Point, Texture, Vector and Normal modes, with XYZ Euler rotations in radians.
- Vector Math: Add, Subtract, Multiply, safe Divide, Scale, Cross/Dot Product, Distance, Length, Normalize, Absolute, Minimum/Maximum, Floor/Ceil, Fraction, Sine and Cosine. Scalar operations expose Value; others expose Vector.
- Float Map Range with Linear, Stepped, Smoothstep and Smootherstep interpolation, including reversed ranges and optional output clamping.
- Bump Height/Strength/Distance/Invert and chained normals; tangent-space Normal Map with the default UV set. Connect their Normal outputs to Principled Normal. Height derivatives and normal shading are renderer approximations, not exact Cycles parity. Normal textures should use linear/non-color data. Named UV sets and object/world-space Normal Map modes retain fallback diagnostics.
- RGB Color Ramp with 2–32 RGBA stops and Linear, Constant or Ease interpolation; other color/interpolation modes require baking.
- Texture Coordinate Window output, mapped to bottom-left normalized screen coordinates.
- Flat image textures using embedded PNGs, sRGB or linear/non-color data, Repeat or Extend wrapping, and Linear or Closest interpolation.
- Math Add, Subtract, Multiply, Minimum, and Maximum, including output clamping.
- Mix Color's Mix operation, including factor and output clamping.
- Numeric/color reroutes and implicit scalar/color conversion.
- Blender 3D fBM Noise without distortion, and Checker Fac. These translate to procedural approximations; Noise Color is grayscale. Other noise dimensions/types and Checker Color retain fallback diagnostics.

Only connected, reachable nodes must be supported. Unsupported connected branches keep the entire glTF fallback material, with a diagnostic explaining the first failure. Node groups, other Blender procedural textures, shader mixing, subsurface scattering, anisotropy, custom coat tint/IOR, thin films, volumes, and displacement are not implemented. Bake these in Blender or replace the unsupported branch. There is no automatic baking command yet.

### Procedural palette and physical inputs

The editor adds **Noise (Perlin)**, **Fractal Noise (fBM)**, **Turbulence** (absolute fBM), **Voronoi Distance**, **Cell Noise**, **Checker**, and **Wave Bands**. Each exposes Scale and a connectable Vector, plus grayscale Factor/Color outputs. fBM and Turbulence also expose Detail (1–8 integer octaves), Roughness (0–1), and Lacunarity (1–4). Unconnected Vector uses local object position; connect UV Coordinates for UV-based patterns. MaterialX noise and local coordinates are not Blender's noise implementation or normalized Generated coordinates, so patterns will differ. Voronoi is a distance pattern, and Wave is sine bands along X; these are not full Blender Voronoi/Wave node replacements.

Principled now also exposes **transmission, thickness, attenuation color/distance, clearcoat/roughness, sheen color/roughness, diffuse roughness, and specular intensity/color**. Expand **+ Glass, thickness, coat & sheen** to see unused physical inputs; connected or changed inputs stay visible when collapsed. These inputs can be wired to noise or other nodes and are included in exported TSL modules. Physical lobes remain disabled when their values are at defaults, avoiding unnecessary shader cost.

**Alpha** controls surface opacity; enable **Alpha blending** to blend it. **Transmission** is refractive glass, independent of alpha: generally keep alpha at 1 for glass. **Thickness** controls the Three.js transmission volume approximation, in scene units, with attenuation color/distance controlling absorption. Thickness is an editor-specific physical control, not Blender Principled subsurface thickness, and Blender Volume nodes are not translated. This is not a subsurface-scattering implementation.

Principled is approximated with `MeshPhysicalNodeMaterial`, not a reproduction of Cycles or Eevee. Scene lighting, color management, and renderer choices can change appearance. Bridge PNGs live in graph metadata independently of glTF's normal texture slots, so normal KTX2/resize optimizations do not compress them and they increase GLB size. Images are limited to 24 MB before base64 encoding; graphs to 512 nodes.

## Create and connect nodes

Open **Materials** in the sidebar. The existing model viewport remains above the node editor so changes are visible immediately.

1. Choose the **Target material**. Imported bridge materials retain their graph. Ordinary glTF materials start with a flat Principled approximation; textures must be added explicitly to the new graph.
2. Choose a node from the categorized palette, then move onto the canvas and click to place it. The full node follows the pointer until placement. Escape or right-click cancels without changing the graph. Adding a node never changes your zoom or pans the graph. Search narrows the palette; Enter picks its first match.
3. Drag node headers to arrange them. Movement updates once per animation frame, with one undo checkpoint per drag; Escape restores the starting position. Hold Shift while placing or moving to snap to the 20-unit grid. Drag the background, middle-drag, or Space-drag over any node to pan; scroll to zoom around the pointer. Each material remembers its view when switching workspaces. **Fit** frames the graph and **Arrange** lays it out by dependencies. Selecting a node does not resize it. The canvas cannot scroll independently when editing a field, keeping socket hit areas aligned with their wires.
4. Click an output socket, then an input socket, or drag a wire. Outputs can be grabbed near their dots; compatible inputs magnetically snap within 26 screen pixels, independent of zoom. The elastic wire follows the cursor and turns green when snapped. Drop near the highlighted input to connect; Escape cancels. Shader sockets connect only to shader sockets, and cycle-forming targets do not snap.
5. Edit unconnected defaults directly on each node, including separate XYZ controls for vectors. Drag numeric fields horizontally to scrub; Shift is fine and Ctrl/Cmd is coarse. Typing and keyboard arrows still work; Escape cancels a scrub. Select a node to rename its label. Image Texture nodes accept PNG, JPEG, or WebP files converted to an embedded PNG, plus KTX2 files whose compressed bytes and mipmaps are preserved, with an 8192-pixel dimension limit.
6. Drag an existing input connection to rewire it, or release over empty space to detach it; Escape cancels. Use the unplug button or right-click an input/wire to disconnect it. Drop a compatible node over a wire to insert it; green highlighting previews the target connection. Delete removes a node and its connections. Multiple Material Output nodes are allowed, but only the one marked **Active output** is compiled.

Valid changes preview automatically after a short debounce. Invalid graphs display diagnostics and preserve the last valid preview. **Alpha blending** enables opacity blending for the edited material. A disconnected or incomplete image node does not invalidate unrelated branches.

### Shortcuts

The editor must have focus; text and numeric fields retain their normal editing behavior.

| Shortcut           | Action                                             |
| ------------------ | -------------------------------------------------- |
| Shift+A            | Focus node search                                  |
| Shift+D            | Duplicate the selected node                        |
| Delete / Backspace | Remove the selected node                           |
| Cmd/Ctrl+Z         | Undo                                               |
| Cmd/Ctrl+Shift+Z   | Redo                                               |
| Home               | Fit the graph                                      |
| Escape             | Cancel an in-progress connection / clear selection |

Undo/redo keeps up to 40 editing checkpoints per material. Drafts and history survive switching workspace tabs, but not app restarts, model replacement, or Blender re-export. **Save graph** before leaving the session. There is no two-way synchronization back into Blender and no full Node Wrangler shortcut implementation.

## Export and use materials

**Save graph** downloads a `.material.json` file, including node positions, links, defaults, and embedded textures. **Import** restores a graph onto the chosen target material. Invalid drafts can be saved, but only supported, valid graphs can be exported as TSL.

**Export TSL** downloads a self-contained `.material.ts` module. It imports only `three/webgpu` and `three/tsl` and exports an asynchronous `createMaterial()` factory:

```ts
import { createMaterial } from "./Painted.material";

const asset = await createMaterial();
mesh.material = asset.material;

const firstParameter = Object.values(asset.parameters)[0];
if (firstParameter) firstParameter.value = 0.7;

asset.dispose();
```

The returned parameters are Value-node uniforms keyed by generated node IDs. Inspect the generated module or its graph to identify them. Dispose only when the material is no longer rendered. Textures are embedded as PNG or KTX2 data URLs. For KTX2, pass `createMaterial({ loadKTX2: url => loader.loadAsync(url) })` with a `KTX2Loader` configured with its transcoder path and `detectSupport(renderer)` after renderer initialization. The viewer and generated model bundles supply that callback automatically.

The editor-only **Screen Space** node exposes bottom-left UV, X/Y, physical pixel position and drawing-buffer resolution. It is camera-relative coordinate generation, not screen color/depth capture.

The editor-only **Time** node (Input category) drives animated materials without rebuilding their graphs. **Seconds** is renderer elapsed time × **speed** + **offset**, with offset in seconds; negative speed reverses the effect and zero holds it at the offset. Speed is a multiplier, not an integrated playback rate: changing it can jump the animation. **Delta** is the unscaled interval between rendered frames in seconds; **Frame** is the unscaled renderer frame counter. These are renderer-clock values, independent of the model animation play/pause and timeline. Connect Seconds to Mapping location for scrolling textures, noise coordinates for evolving noise, or a Color Ramp factor for a timed transition. Generated TSL modules use the same live clock and need no manual uniform updates. This is an editor feature, not a translation of Blender timeline drivers, and is not a baked animation in a standard glTF material.

**Editor changes are separate exports:** the main optimized GLB/bundle pipeline retains the original model's materials and embedded Blender graph, not unsaved editor overrides. Use the exported material factory to replace the relevant mesh material in your application. Editing and embedding new graphs into optimized GLBs is not implemented.

## Renderer and bundled loaders

The viewer, comparison view, texture debugger, and channel/weight inspection shaders use `WebGPURenderer` and TSL. GPU initialization is asynchronous; the viewport identifies native **WebGPU** or the renderer's **WebGL 2 fallback**. Node materials require this renderer, not the separate legacy `WebGLRenderer`.

Three.js bundles include the graph interpreter, type declarations, and `materials.ts` alongside the model and decoders. `loadModel(renderer)` initializes a WebGPU renderer and translates embedded bridge graphs automatically. `asset.materials.reports` lists translation/fallback diagnostics; `setParameter(materialKey, parameterId, value)` changes a Value uniform. Disposing the loaded asset restores source materials and releases bridge resources.

For R3F, copy the generated `WebGPUCanvas.tsx` and material runtime files along with `Model.tsx`, then render `<WebGPUCanvas><Model /></WebGPUCanvas>`. A normal R3F `Canvas` continues to use glTF fallback materials. The generated loader supports both renderer types for that reason.

## Validation

- `npm test` runs graph/model tests, strict checks of generated TypeScript, and Electron tests for editing, wiring, live preview, import/export, screenshot readback, and existing workflows.
- `npm run test:blender` runs the add-on in a real background Blender process and verifies PNG pixels, stable IDs, saved-source preservation, save-driven export, graph compilation, and optimizer metadata preservation. Set `BLENDER` to the executable path outside the default macOS location.
- After building, `BLENDER_UI_TEST=1 npm run test:blender` also loads real exported image/procedural graphs in the Electron editor and verifies TSL rendering, camera selection, scene lighting, and helpers.
