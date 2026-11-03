import { realpath, readFile } from "node:fs/promises";
import path from "node:path";
export async function localResource(root, uri) {
  if (/^[a-z][a-z\d+.-]*:/i.test(uri))
    throw new Error("Remote resources are blocked.");
  const file = await realpath(path.resolve(root, decodeURIComponent(uri)));
  const relative = path.relative(root, file);
  if (
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  )
    throw new Error("Resource is outside the selected model directory.");
  return new Uint8Array(await readFile(file));
}
export function gltfJSON(bytes) {
  if (
    bytes.length >= 20 &&
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
      0,
      true,
    ) === 0x46546c67
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      length = view.getUint32(12, true);
    if (view.getUint32(16, true) !== 0x4e4f534a || 20 + length > bytes.length)
      throw new Error("Invalid GLB JSON chunk.");
    return JSON.parse(
      new TextDecoder().decode(bytes.subarray(20, 20 + length)),
    );
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
