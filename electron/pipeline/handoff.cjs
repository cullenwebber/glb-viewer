function handoffFiles(json, base) {
  const uniqueNames = (values) =>
    values.filter(
      (name, index) =>
        name &&
        values.indexOf(name) === index &&
        values.lastIndexOf(name) === index,
    );
  const names = uniqueNames((json.nodes || []).map((node) => node.name));
  const objectIndices = Object.fromEntries(
    names.map((name) => [
      name,
      json.nodes.findIndex((node) => node.name === name),
    ]),
  );
  const animationNames = (json.animations || []).map(
    (clip, index) => clip.name || `animation_${index}`,
  );
  const types = `import type * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
export const objectIndices = ${JSON.stringify(objectIndices, null, 2)} as const;
export const animationNames = ${JSON.stringify(animationNames)} as const;
export type ObjectName = keyof typeof objectIndices;
export type AnimationName = typeof animationNames[number];
// Names duplicated in the asset are excluded from this lookup. Use glTF node indices for those objects.
export function getObject(gltf: GLTF, name: ObjectName): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  gltf.scene.traverse(object => { if (gltf.parser.associations.get(object)?.nodes === objectIndices[name]) found = object; });
  return found;
}
export function getAnimation(gltf: GLTF, name: AnimationName): THREE.AnimationClip | undefined { return gltf.animations.find(clip => clip.name === name); }
`;
  const r3f = `import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeElements } from '@react-three/fiber';
import type { AnimationName } from './model-types';
import { loadModel } from './load-model';
type Asset = Awaited<ReturnType<typeof loadModel>>;
export type ModelProps = Omit<ThreeElements['group'], 'children'> & { url?: string; decoderPath?: string; animation?: AnimationName; playing?: boolean; onError?: (error: Error) => void };
export function Model({ url='/models/${base}/model.glb', decoderPath='/models/${base}/decoders/', animation, playing=true, onError, ...props }: ModelProps) {
  const renderer = useThree(state => state.gl);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let cancelled=false, loaded: Asset | undefined;
    setAsset(null); setError(null);
    loadModel(renderer, url, decoderPath).then(value => {
      if(cancelled) { value.dispose(); return; }
      loaded=value; setAsset(value);
    }).catch(reason => { if(!cancelled) setError(reason instanceof Error ? reason : new Error(String(reason))); });
    return () => { cancelled=true; loaded?.dispose(); };
  }, [renderer,url,decoderPath]);
  useEffect(() => { if(error) onError?.(error); },[error,onError]);
  useEffect(() => {
    if(!asset || !animation) return;
    const clip=asset.gltf.animations.find(item=>item.name===animation);
    if(!clip) return;
    const action=asset.mixer.clipAction(clip); action.reset().play();
    return () => { action.stop(); };
  },[asset,animation]);
  useFrame((_,delta) => { if(playing) asset?.mixer.update(delta); });
  if(error && !onError) throw error;
  return <group {...props}>{asset && <primitive object={asset.gltf.scene} dispose={null}/>}</group>;
}
`;
  return { types, r3f };
}
module.exports = { handoffFiles };
