import * as THREE from "three";
import type { Node } from "three/webgpu";

export function materialTextures(material: THREE.Material) {
  const textures = new Set<THREE.Texture>();
  const visited = new Set<Node>();
  const inspect = (node: Node) => {
    if (visited.has(node)) return;
    visited.add(node);
    const texture = (node as unknown as { value?: unknown }).value;
    if (texture instanceof THREE.Texture) textures.add(texture);
    for (const child of node.getChildren()) inspect(child);
  };
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) textures.add(value);
    else if ((value as Node | null)?.isNode) inspect(value as Node);
  }
  return textures;
}
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
