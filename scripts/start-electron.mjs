import { spawn } from "node:child_process";
import electron from "electron";
import path from "node:path";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = process.argv.slice(2),
  packaged = args.includes("--packaged") && process.platform === "darwin";
const executable = packaged
  ? path.resolve(
      "release",
      process.arch === "arm64" ? "mac-arm64" : "mac",
      "GLB Viewer.app/Contents/MacOS/GLB Viewer",
    )
  : electron;
const child = spawn(
  executable,
  [...(packaged ? [] : ["."]), ...args.filter((arg) => arg !== "--packaged")],
  {
    stdio: "inherit",
    env,
  },
);
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
