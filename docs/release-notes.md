## GLB Viewer 1.3.2

- Fixes the macOS "GLB Viewer is damaged and can't be opened" error on downloaded builds.
- Reorganizes the README around screenshots, with KTX2 texture compression up front.

Choose the **arm64** DMG for Apple Silicon or **x64** for Intel. Copy GLB Viewer to Applications.

**First launch:** these builds aren't notarized by Apple yet, so macOS will warn you. Open **System Settings → Privacy & Security** and click **Open Anyway**. If it still won't open, run `xattr -cr "/Applications/GLB Viewer.app"` in Terminal.

Update checks open the release page for manual installation; saved presets, budgets, and history are retained.
