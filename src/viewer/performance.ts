import * as THREE from "three";
export type MeshMetric = {
  id: string;
  name: string;
  sourceIndex: number | null;
  triangles: number;
  vertices: number;
  materials: string[];
  drawCalls: number;
  geometryBytes: number;
  transparent: boolean;
  transmission: boolean;
};
export function geometryBytes(
  geometry: THREE.BufferGeometry,
  seen = new Set<object>(),
) {
  let bytes = 0;
  const attributes = [
    ...Object.values(geometry.attributes),
    ...Object.values(geometry.morphAttributes).flat(),
    ...(geometry.index ? [geometry.index] : []),
  ];
  for (const attribute of attributes) {
    const interleaved = attribute as THREE.InterleavedBufferAttribute;
    const buffer = interleaved.isInterleavedBufferAttribute
      ? interleaved.data
      : attribute;
    if (!seen.has(buffer)) {
      seen.add(buffer);
      bytes += buffer.array?.byteLength || 0;
    }
  }
  return bytes;
}
export function textureMemory(textures: Set<THREE.Texture>) {
  let bytes = 0;
  for (const texture of textures) {
    if ((texture as THREE.CompressedTexture).isCompressedTexture) {
      for (const mip of texture.mipmaps as { data?: Uint8Array }[])
        bytes += mip.data?.byteLength || 0;
    } else {
      const image = texture.image as { width?: number; height?: number };
      bytes +=
        (image?.width || 0) *
        (image?.height || 0) *
        4 *
        (texture.generateMipmaps ? 4 / 3 : 1);
    }
  }
  return Math.round(bytes);
}
