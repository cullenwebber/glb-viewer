## GLB Viewer 1.5.0

- Click an object to inspect its assigned materials, jump into its material graph, and identify shared materials.
- Imported material graphs now show the model's actual image textures, including KTX2 previews, texture names, dimensions, UV channels, and color spaces.
- Inspect packed texture channels with Separate Color nodes and preserve material factors, normal-map scales, sampling, and supported physical-material maps.
- Source texture references avoid duplicating image data; exported TSL supports a texture resolver for the original model's textures.
- Fix the temporary torus-knot flash on startup: the loading screen now transitions directly to Littlest Tokyo, including after reload.

Choose the **arm64** DMG for Apple Silicon or **x64** for Intel. Copy GLB Viewer to Applications.

**First launch:** these builds aren't notarized by Apple yet, so macOS will warn you. Open **System Settings → Privacy & Security** and click **Open Anyway**. If it still won't open, run `xattr -cr "/Applications/GLB Viewer.app"` in Terminal.

Update checks open the release page for manual installation; saved presets, budgets, and history are retained.
