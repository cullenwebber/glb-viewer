import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const archive = fileURLToPath(
  new URL("../dist/glb-viewer-bridge.zip", import.meta.url),
);
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await rm(archive, { force: true });
execFileSync(
  process.platform === "win32"
    ? path.join(process.env.SystemRoot, "System32", "tar.exe")
    : "zip",
  process.platform === "win32"
    ? ["-a", "-c", "-f", archive, "glb_viewer_bridge/__init__.py"]
    : ["-q", archive, "glb_viewer_bridge/__init__.py"],
  { cwd: root + "blender" },
);
