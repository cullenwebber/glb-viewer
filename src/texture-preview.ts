import * as THREE from "three";
import { useBundledWorker } from "./decoder-workers";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
let gpu: THREE.WebGLRenderer | undefined;
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
  gpu ||= new THREE.WebGLRenderer({ antialias: false });
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
    const target = new THREE.WebGLRenderTarget(canvas.width, canvas.height);
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } },
      vertexShader:
        "varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader:
        "uniform sampler2D map; varying vec2 vUv; void main(){gl_FragColor=texture2D(map,vUv);}",
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    gpu.setRenderTarget(target);
    gpu.render(scene, new THREE.Camera());
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gpu.readRenderTargetPixels(
      target,
      0,
      0,
      canvas.width,
      canvas.height,
      pixels,
    );
    gpu.setRenderTarget(null);
    const image = new ImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++)
      image.data.set(
        pixels.subarray(
          (canvas.height - y - 1) * canvas.width * 4,
          (canvas.height - y) * canvas.width * 4,
        ),
        y * canvas.width * 4,
      );
    canvas.getContext("2d")!.putImageData(image, 0, 0);
    texture.dispose();
    target.dispose();
    material.dispose();
    geometry.dispose();
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
