import * as THREE from "three";
import type { ModelFile } from "../model-types";
export type FileEntry = { file: File; path: string };
export async function loadFiles(
  entries: FileEntry[],
  load: (file: ModelFile, manager?: THREE.LoadingManager) => Promise<void>,
) {
  const primary = entries.find((entry) => /\.(glb|gltf)$/i.test(entry.path));
  if (!primary)
    throw new Error(
      "Choose a .glb or .gltf model, or drop a complete model folder.",
    );
  if (window.desktop) {
    await load(await window.desktop.openFile(primary.file));
    return;
  }
  const urls = new Map(
    entries.map((entry) => [
      entry.path.replace(/^\/+/, ""),
      URL.createObjectURL(entry.file),
    ]),
  );
  const base = "https://local-model.invalid/";
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(blob:|data:)/.test(url)) return url;
    const key = decodeURIComponent(new URL(url, base).pathname).replace(
        /^\/+/,
        "",
      ),
      mapped = urls.get(key);
    if (!mapped) throw new Error("Missing local resource: " + key);
    return mapped;
  });
  try {
    await load(
      {
        url: base + primary.path.split("/").map(encodeURIComponent).join("/"),
        name: primary.file.name,
        size: primary.file.size,
      },
      manager,
    );
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
  }
}
export async function readEntry(
  entry: FileSystemEntry,
  prefix = "",
): Promise<FileEntry[]> {
  if (entry.isFile)
    return new Promise((resolve, reject) =>
      (entry as FileSystemFileEntry).file(
        (file) => resolve([{ file, path: prefix + file.name }]),
        reject,
      ),
    );
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  while (true) {
    const batch: FileSystemEntry[] = await new Promise((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!batch.length) break;
    children.push(...batch);
  }
  return (
    await Promise.all(
      children.map((child) => readEntry(child, prefix + entry.name + "/")),
    )
  ).flat();
}
