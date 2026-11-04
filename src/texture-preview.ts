import * as THREE from "three";
import { WebGPURenderer, MeshBasicNodeMaterial } from "three/webgpu";
import { texture as sampleTexture } from "three/tsl";
import { useBundledWorker } from "./decoder-workers";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
let gpu: WebGPURenderer | undefined;
let queue: Promise<unknown> = Promise.resolve();
let decoder: KTX2Loader | undefined;
export function textureThumbnail(source: THREE.Texture): Promise<string> {
  const task = queue.then(async () => {
    const canvas = document.createElement("canvas");
    const image = source.image as CanvasImageSource & {
      width: number;
      height: number;
      data?: unknown;
    };
    if (
      !(source as THREE.CompressedTexture).isCompressedTexture &&
      image &&
      !image.data
    ) {
      const scale = Math.min(1, 160 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas
        .getContext("2d")!
        .drawImage(image, 0, 0, canvas.width, canvas.height);
    } else {
      gpu ||= new WebGPURenderer({ antialias: false });
      await gpu.init();
      const texture = source.clone();
      texture.colorSpace = THREE.NoColorSpace;
      texture.channel = 0;
      texture.offset.set(0, 0);
      texture.repeat.set(1, 1);
      texture.rotation = 0;
      texture.updateMatrix();
      try {
        await renderTexturePreview(texture, canvas, 160);
      } finally {
        texture.dispose();
      }
    }
    return canvas.toDataURL("image/png");
  });
  queue = task.catch(() => {});
  return task;
}
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
    try {
      texture.colorSpace = THREE.NoColorSpace;
      return await renderTexturePreview(texture, canvas, 2048);
    } finally {
      texture.dispose();
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function renderTexturePreview(
  texture: THREE.Texture,
  canvas: HTMLCanvasElement,
  limit: number,
) {
  const renderer = gpu!;
  const imageSize = texture.image as { width: number; height: number };
  const scale = Math.min(
    1,
    limit / Math.max(imageSize.width, imageSize.height),
  );
  canvas.width = Math.max(1, Math.round(imageSize.width * scale));
  canvas.height = Math.max(1, Math.round(imageSize.height * scale));
  // Render raw sampled values; avoid scene lighting and tone mapping in the debugger.
  texture.colorSpace = THREE.NoColorSpace;
  const target = new THREE.RenderTarget(canvas.width, canvas.height);
  const material = new MeshBasicNodeMaterial();
  material.outputNode = sampleTexture(texture);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    const pixels = await renderer.readRenderTargetPixelsAsync(
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
          (renderer.coordinateSystem === THREE.WebGPUCoordinateSystem
            ? y
            : canvas.height - y - 1) *
            canvas.width *
            4,
          (renderer.coordinateSystem === THREE.WebGPUCoordinateSystem
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
    renderer.setRenderTarget(null);
    target.dispose();
    material.dispose();
    geometry.dispose();
  }
}
