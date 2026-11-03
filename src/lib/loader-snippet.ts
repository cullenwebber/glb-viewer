export function loaderSnippet(filename: string) {
  return `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Copy Three.js decoders into your public/decoders directory.
const loader = new GLTFLoader()
  .setDRACOLoader(new DRACOLoader().setDecoderPath('/decoders/draco/'))
  .setKTX2Loader(new KTX2Loader().setTranscoderPath('/decoders/basis/').detectSupport(renderer))
  .setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('/models/${encodeURIComponent(filename)}');
scene.add(gltf.scene);
`;
}
