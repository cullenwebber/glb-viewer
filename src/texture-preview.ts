import * as THREE from "three";
import { WebGPURenderer, MeshBasicNodeMaterial } from "three/webgpu";
import { texture as sampleTexture } from "three/tsl";
import { useBundledWorker } from "./decoder-workers";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
let gpu: WebGPURenderer | undefined;
let queue: Promise<unknown> = Promise.resolve();
let decoder: KTX2Loader | undefined;
export async function decodePreview(
  bytes: Uint8Array,
  mime: string,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  if (mime !== "image/ktx2") {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type: mime }),
    );
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas;
  }
  const task = queue.then(() => decodeKTX(bytes, canvas));
  queue = task.catch(() => {});
  return task;
}
async function decodeKTX(bytes: Uint8Array, canvas: HTMLCanvasElement) {
  gpu ||= new WebGPURenderer({ antialias: false });
  await gpu.init();
  if (!decoder) {
    decoder = new KTX2Loader()
      .setTranscoderPath("./decoders/basis/")
      .detectSupport(gpu);
    useBundledWorker(decoder, "init", "basis-worker.js");
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
  try {
    const texture = await decoder.loadAsync(url);
    const scale = Math.min(
      1,
      2048 / Math.max(texture.image.width, texture.image.height),
    );
    canvas.width = Math.max(1, Math.round(texture.image.width * scale));
    canvas.height = Math.max(1, Math.round(texture.image.height * scale));
    // Render raw sampled values; avoid scene lighting and tone mapping in the debugger.
    texture.colorSpace = THREE.NoColorSpace;
    const target = new THREE.RenderTarget(canvas.width, canvas.height);
    const material = new MeshBasicNodeMaterial();
    material.outputNode = sampleTexture(texture);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    try {
      gpu.setRenderTarget(target);
      gpu.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
      const pixels = await gpu.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const image = new ImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y++)
        image.data.set(
          pixels.subarray(
            (gpu.coordinateSystem === THREE.WebGPUCoordinateSystem
              ? y
              : canvas.height - y - 1) *
              canvas.width *
              4,
            (gpu.coordinateSystem === THREE.WebGPUCoordinateSystem
              ? y + 1
              : canvas.height - y) *
              canvas.width *
              4,
          ),
          y * canvas.width * 4,
        );
      canvas.getContext("2d")!.putImageData(image, 0, 0);
      return canvas;
    } finally {
      gpu.setRenderTarget(null);
      texture.dispose();
      target.dispose();
      material.dispose();
      geometry.dispose();
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
