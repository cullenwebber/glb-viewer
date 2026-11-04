import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Document } from "@gltf-transform/core";
import { SphereGeometry } from "three";
import sharp from "sharp";
import { read as readKTX } from "ktx-parse";
import { Optimizer, createIO } from "../electron/optimizer.mjs";
import { KHRMaterialsClearcoat } from "@gltf-transform/extensions";
import { BRIDGE_KEY } from "../electron/pipeline/material-graph.mjs";
export async function fixture(directory) {
  const io = await createIO(),
    doc = new Document(),
    buffer = doc.createBuffer();
  const image = async (name, size, rgba) =>
    doc
      .createTexture(name)
      .setMimeType("image/png")
      .setImage(
        await sharp({
          create: { width: size, height: size, channels: 4, background: rgba },
        })
          .png()
          .toBuffer(),
      );
  const albedo = await image("Albedo", 128, { r: 180, g: 70, b: 30, alpha: 1 });
  const normal = await image("Normal", 64, {
    r: 128,
    g: 128,
    b: 255,
    alpha: 1,
  });
  const ao = await image("Occlusion", 64, { r: 80, g: 80, b: 80, alpha: 1 });
  const mr = await image("Roughness metalness", 64, {
    r: 255,
    g: 150,
    b: 25,
    alpha: 1,
  });
  const material = doc
    .createMaterial("Paint")
    .setBaseColorTexture(albedo)
    .setNormalTexture(normal)
    .setOcclusionTexture(ao)
    .setMetallicRoughnessTexture(mr)
    .setMetallicFactor(0.5)
    .setRoughnessFactor(0.7);
  const geometry = new SphereGeometry(1, 24, 16);
  const attribute = (name, type) =>
    doc
      .createAccessor()
      .setBuffer(buffer)
      .setType(type)
      .setArray(geometry.getAttribute(name).array.slice());
  const primitive = doc
    .createPrimitive()
    .setAttribute("POSITION", attribute("position", "VEC3"))
    .setAttribute("NORMAL", attribute("normal", "VEC3"))
    .setAttribute("TEXCOORD_0", attribute("uv", "VEC2"))
    .setIndices(
      doc
        .createAccessor()
        .setBuffer(buffer)
        .setType("SCALAR")
        .setArray(geometry.index.array.slice()),
    )
    .setMaterial(material);
  const node = doc
    .createNode("Sphere")
    .setMesh(doc.createMesh("Sphere").addPrimitive(primitive));
  doc.createScene().addChild(node);
  const file = path.join(directory, "fixture.glb");
  await writeFile(file, await io.writeBinary(doc));
  return { file, io, doc };
}
async function test() {
  const directory = await mkdtemp(path.join(tmpdir(), "glb-optimizer-"));
  try {
    const { file, io, doc } = await fixture(directory),
      engine = new Optimizer();
    const analysis = await engine.open(file);
    assert.equal(analysis.textures.length, 4);
    assert.equal(analysis.beforeBytes, (await stat(file)).size);
    const unchanged = await readFile(file);
    const settings = analysis.textures.map((row) => ({
      id: row.id,
      maxSize: 0,
      format: "keep",
    }));
    const report = await engine.optimize({
      geometry: "none",
      textures: settings.map((row) => ({
        ...row,
        maxSize: row.id === 0 ? 64 : row.id === 3 ? 16 : 0,
      })),
      packs: [],
    });
    assert.equal(report.textures[0].width, 64);
    assert.equal(report.textures[1].width, 64);
    assert.equal(report.textures[3].width, 16);
    assert.equal(report.afterBytes, engine.output.byteLength);
    for (const compression of ["draco", "meshopt"]) {
      const next = await engine.optimize({
        geometry: compression,
        textures: settings,
        packs: [],
      });
      const loaded = await io.readBinary(engine.output);
      assert(
        loaded
          .getRoot()
          .listExtensionsUsed()
          .some(
            (ext) =>
              ext.extensionName ===
              (compression === "draco"
                ? "KHR_draco_mesh_compression"
                : "EXT_meshopt_compression"),
          ),
      );
      assert.equal(loaded.getRoot().listMeshes().length, 1);
      assert(next.afterBytes < next.beforeBytes);
      console.log(
        `PASS: ${compression} round trip ${next.beforeBytes} → ${next.afterBytes}`,
      );
    }
    const pack = {
      name: "Packed ORM",
      material: 0,
      target: "orm",
      size: 32,
      format: "png",
      channels: [
        { texture: 2, channel: 0, value: 255 },
        { texture: 3, channel: 1, value: 255 },
        { texture: 3, channel: 2, value: 255 },
        { texture: null, channel: 3, value: 255 },
      ],
    };
    const packed = await engine.optimize({
      geometry: "none",
      textures: settings,
      packs: [pack],
    });
    assert.equal(packed.textures.length, 3);
    const orm = engine.resultDoc.getRoot().listMaterials()[0];
    assert.equal(orm.getOcclusionTexture(), orm.getMetallicRoughnessTexture());
    assert.equal(orm.getRoughnessFactor(), 0.7);
    const pixel = await sharp(orm.getOcclusionTexture().getImage())
      .ensureAlpha()
      .raw()
      .toBuffer();
    assert.deepEqual([...pixel.subarray(0, 4)], [80, 150, 25, 255]);
    assert.equal(
      packed.comparisons.find((row) => row.key === "t2").afterBytes,
      0,
    );
    const compressed = await engine.optimize({
      geometry: "meshopt",
      textures: settings.map((row) => ({
        ...row,
        format: row.id === 0 ? "etc1s" : row.id === 1 ? "uastc" : "keep",
      })),
      packs: [{ ...pack, format: "uastc" }],
    });
    const loaded = await io.readBinary(engine.output);
    assert.equal(
      loaded
        .getRoot()
        .listTextures()
        .filter((texture) => texture.getMimeType() === "image/ktx2").length,
      3,
    );
    const color = readKTX(
      engine.resultDoc.getRoot().listTextures()[0].getImage(),
    );
    const linear = readKTX(
      engine.resultDoc.getRoot().listTextures()[1].getImage(),
    );
    assert.equal(color.dataFormatDescriptor[0].transferFunction, 2);
    assert.equal(linear.dataFormatDescriptor[0].transferFunction, 1);
    assert(color.levels.length > 1);
    assert(linear.levels.length > 1);
    assert.equal(
      compressed.afterTextureBytes,
      compressed.textures.reduce((sum, texture) => sum + texture.bytes, 0),
    );
    await assert.rejects(
      () => engine.optimize({ geometry: "bad", textures: [], packs: [] }),
      /Invalid geometry/,
    );
    await engine.optimize({
      geometry: "none",
      textures: settings.map((row) =>
        row.id === 0
          ? {
              ...row,
              format: "etc1s",
              compression: { quality: 150, effort: 3, mipmaps: false },
            }
          : row,
      ),
      packs: [],
    });
    const singleMip = readKTX(
      engine.resultDoc.getRoot().listTextures()[0].getImage(),
    );
    assert.equal(singleMip.levels.length, 1);
    const compressedSource = path.join(directory, "compressed-source.glb");
    await writeFile(compressedSource, engine.output);
    const compressedEngine = new Optimizer();
    const compressedAnalysis = await compressedEngine.open(compressedSource);
    const compressedRemoved = await compressedEngine.optimize({
      geometry: "none",
      textures: compressedAnalysis.textures.map((texture) => ({
        id: texture.id,
        maxSize: 0,
        format: "keep",
        remove: texture.id === 0,
      })),
      packs: [],
    });
    assert.equal(compressedRemoved.textures.length, 3);
    assert.equal(
      compressedEngine.resultDoc
        .getRoot()
        .listMaterials()[0]
        .getBaseColorTexture(),
      null,
    );
    assert.equal(
      engine.resultDoc
        .getRoot()
        .listMaterials()[0]
        .getBaseColorTextureInfo()
        .getMinFilter(),
      9729,
    );
    await assert.rejects(
      () =>
        engine.optimize({
          geometry: "none",
          textures: [
            {
              id: 0,
              maxSize: 0,
              format: "jpeg",
              compression: { quality: 101 },
            },
          ],
          packs: [],
        }),
      /Texture quality/,
    );
    await assert.rejects(
      () =>
        engine.optimize({
          geometry: "draco",
          geometryOptions: { quantizePosition: 0 },
          textures: settings,
          packs: [],
        }),
      /Position precision/,
    );
    await engine.optimize({
      geometry: "none",
      textures: settings.map((row) =>
        row.id === 0
          ? {
              ...row,
              format: "webp",
              compression: { lossless: true, effort: 5 },
            }
          : row,
      ),
      packs: [],
    });
    const lossless = await sharp(
      engine.resultDoc.getRoot().listTextures()[0].getImage(),
    )
      .ensureAlpha()
      .raw()
      .toBuffer();
    assert.deepEqual([...lossless.subarray(0, 4)], [180, 70, 30, 255]);
    const external = path.join(directory, "external.gltf");
    await io.write(external, doc);
    const externalEngine = new Optimizer(),
      externalAnalysis = await externalEngine.open(external);
    assert(externalAnalysis.sourceFiles > 1);
    assert.equal(
      externalAnalysis.beforeBytes,
      (
        await Promise.all(
          [
            ...new Set([
              "external.gltf",
              "external.bin",
              ...JSON.parse(await readFile(external, "utf8")).images.map(
                (image) => decodeURIComponent(image.uri),
              ),
            ]),
          ].map(async (name) => (await stat(path.join(directory, name))).size),
        )
      ).reduce((a, b) => a + b, 0),
    );
    const removed = await engine.optimize({
      geometry: "none",
      textures: settings.map((setting) => ({
        ...setting,
        remove: [1, 2].includes(setting.id),
      })),
      packs: [],
    });
    assert.equal(removed.textures.length, 2);
    const removedMaterial = engine.resultDoc.getRoot().listMaterials()[0];
    assert.equal(removedMaterial.getNormalTexture(), null);
    assert.equal(removedMaterial.getOcclusionTexture(), null);
    assert(removedMaterial.getBaseColorTexture());
    assert(removedMaterial.getMetallicRoughnessTexture());
    assert.equal(removedMaterial.getRoughnessFactor(), 0.7);
    assert.equal(
      removed.comparisons.find((row) => row.key === "t1").outputId,
      null,
    );
    assert.equal(
      removed.comparisons.find((row) => row.key === "t2").afterBytes,
      0,
    );
    assert(engine.original.getRoot().listMaterials()[0].getNormalTexture());
    const keptAgain = await engine.optimize({
      geometry: "none",
      textures: settings,
      packs: [],
    });
    assert.equal(keptAgain.textures.length, 4);
    await assert.rejects(
      () =>
        engine.optimize({
          geometry: "none",
          textures: settings.map((setting) => ({
            ...setting,
            remove: setting.id === 2,
          })),
          packs: [pack],
        }),
      /marked for removal.*packing/,
    );
    await assert.rejects(
      () =>
        engine.optimize({
          geometry: "none",
          textures: [{ ...settings[0], remove: "yes" }],
          packs: [],
        }),
      /removal setting/,
    );
    await assert.rejects(
      () =>
        engine.optimize({
          geometry: "none",
          textures: [settings[0], settings[0]],
          packs: [],
        }),
      /duplicated/,
    );
    const allRemoved = await engine.optimize({
      geometry: "none",
      textures: settings.map((setting) => ({ ...setting, remove: true })),
      packs: [],
    });
    assert.equal(allRemoved.textures.length, 0);
    assert.equal(
      (await io.readBinary(engine.output)).getRoot().listTextures().length,
      0,
    );
    const originalMaterial = doc.getRoot().listMaterials()[0];
    originalMaterial.setExtras({
      [BRIDGE_KEY]: "embedded graph",
      retained: "yes",
    });
    const shared = doc
      .createMaterial("Shared image")
      .setNormalTexture(doc.getRoot().listTextures()[1]);
    shared.setExtension(
      "KHR_materials_clearcoat",
      doc
        .createExtension(KHRMaterialsClearcoat)
        .createClearcoat()
        .setClearcoatNormalTexture(doc.getRoot().listTextures()[1]),
    );
    const sharedFile = path.join(directory, "shared.glb");
    await writeFile(sharedFile, await io.writeBinary(doc));
    const sharedEngine = new Optimizer();
    await sharedEngine.open(sharedFile);
    const sharedRemoved = await sharedEngine.optimize({
      geometry: "none",
      textures: settings.map((setting) => ({
        ...setting,
        remove: setting.id === 1,
      })),
      packs: [],
    });
    const sharedMaterials = sharedEngine.resultDoc.getRoot().listMaterials();
    assert(
      sharedMaterials.every((material) => material.getNormalTexture() === null),
    );
    assert.equal(
      sharedMaterials
        .find((material) => material.getName() === "Shared image")
        .getExtension("KHR_materials_clearcoat")
        .getClearcoatNormalTexture(),
      null,
    );
    assert.equal(sharedMaterials[0].getExtras()[BRIDGE_KEY], undefined);
    assert.equal(sharedMaterials[0].getExtras().retained, "yes");
    assert(
      sharedRemoved.warnings.some((warning) =>
        warning.includes("embedded Blender shader graph"),
      ),
    );
    assert.equal(
      sharedEngine.original.getRoot().listMaterials()[0].getExtras()[
        BRIDGE_KEY
      ],
      "embedded graph",
    );
    assert.deepEqual(await readFile(file), unchanged);
    console.log(
      "PASS: per-texture resize, channel packing pixel values/bindings/removal, ETC1S/UASTC KTX2 color metadata + mipmaps, exact size accounting, external resources, original preservation.",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) await test();
