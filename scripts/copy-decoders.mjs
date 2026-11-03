import { cp, mkdir } from "node:fs/promises";
await mkdir("public/decoders", { recursive: true });
await cp(
  "node_modules/three/examples/jsm/libs/draco/gltf",
  "public/decoders/draco",
  { recursive: true },
);
await cp(
  "node_modules/three/examples/jsm/libs/basis",
  "public/decoders/basis",
  { recursive: true },
);
// Three's Emscripten decoders require JS code generation. Give only these
// isolated, bundled workers their own CSP; the app renderer keeps unsafe-eval off.
const { readFile, writeFile } = await import("node:fs/promises");
const { KTX2Loader } = await import("three/addons/loaders/KTX2Loader.js");
const basis = await readFile(
  "public/decoders/basis/basis_transcoder.js",
  "utf8",
);
const fn = KTX2Loader.BasisWorker.toString();
await writeFile(
  "public/decoders/basis-worker.js",
  [
    `let _EngineFormat=${JSON.stringify(KTX2Loader.EngineFormat)};`,
    `let _EngineType=${JSON.stringify(KTX2Loader.EngineType)};`,
    `let _TranscoderFormat=${JSON.stringify(KTX2Loader.TranscoderFormat)};`,
    `let _BasisFormat=${JSON.stringify(KTX2Loader.BasisFormat)};`,
    basis,
    fn.substring(fn.indexOf("{") + 1, fn.lastIndexOf("}")),
  ].join("\n"),
);
const source = await readFile(
  "node_modules/three/examples/jsm/loaders/DRACOLoader.js",
  "utf8",
);
const dracoWorker = source.slice(
  source.indexOf("function DRACOWorker()"),
  source.lastIndexOf("export {"),
);
if (!dracoWorker.startsWith("function DRACOWorker()"))
  throw new Error("Three.js Draco worker structure changed.");
await writeFile(
  "public/decoders/draco-worker.js",
  (await readFile("public/decoders/draco/draco_wasm_wrapper.js", "utf8")) +
    "\n" +
    dracoWorker.substring(
      dracoWorker.indexOf("{") + 1,
      dracoWorker.lastIndexOf("}"),
    ),
);
