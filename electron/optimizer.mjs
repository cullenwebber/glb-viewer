import {
  meshRows,
  optimizeGeometry,
  normalizeOptimization,
} from "./pipeline/geometry.mjs";
import {
  textureCompression,
  geometryCompression,
} from "./compression-options.mjs";
import { NodeIO, Logger, PropertyType } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  KHRTextureBasisu,
  EXTTextureWebP,
  EXTTextureAVIF,
} from "@gltf-transform/extensions";
import {
  cloneDocument,
  draco,
  meshopt,
  listTextureSlots,
  listTextureInfo,
  getTextureColorSpace,
  weld,
} from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { encodeToKTX2 } from "ktx2-encoder";
import { read as readKTX } from "ktx-parse";
import { realpath, readFile } from "node:fs/promises";
import path from "node:path";

const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
export async function createIO() {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    })
    .setLogger(new Logger(Logger.Verbosity.ERROR));
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
export class Optimizer {
  async open(file) {
    this.io = await createIO();
    const source = await realpath(file),
      root = path.dirname(source);
    const files = new Map();
    this.io.readURI = async (uri, type) => {
      assert(
        !/^[a-z][a-z0-9+.-]*:/i.test(uri),
        "Only local model resources are supported.",
      );
      const resolved = await realpath(uri),
        relative = path.relative(root, resolved);
      assert(
        relative !== ".." &&
          !relative.startsWith(".." + path.sep) &&
          !path.isAbsolute(relative),
        "Resource is outside the model directory.",
      );
      const bytes = await readFile(resolved);
      files.set(resolved, bytes.byteLength);
      return type === "text" ? bytes.toString("utf8") : new Uint8Array(bytes);
    };
    const jsonDoc = await this.io.readAsJSON(source);
    this.json = jsonDoc.json;
    this.resources = [...files.keys()];
    const supported = new Set(
      ALL_EXTENSIONS.map((extension) => extension.EXTENSION_NAME),
    );
    const unknown = (jsonDoc.json.extensionsUsed || []).filter(
      (name) => !supported.has(name),
    );
    assert(
      !unknown.length,
      `Cannot safely export unsupported extensions: ${unknown.join(", ")}. Viewing is still available.`,
    );
    this.original = await this.io.readJSON(jsonDoc);
    this.name = path.basename(source);
    this.source = source;
    this.beforeBytes = [...files.values()].reduce((a, b) => a + b, 0);
    this.imported = new Set();
    this.before = await this.describe(this.original);
    this.sourceFiles = files.size;
    return this.analysis();
  }
  analysis() {
    return {
      name: this.name,
      beforeBytes: this.beforeBytes,
      textures: this.before,
      materials: this.materials(this.original),
      sourceFiles: this.sourceFiles,
      resources: this.resources,
      meshes: meshRows(this.original),
      animations: this.original
        .getRoot()
        .listAnimations()
        .map((animation) => ({
          name: animation.getName(),
          channels: animation.listChannels().length,
        })),
    };
  }
  async importImages(files) {
    assert(this.original, "Open a model first.");
    for (const file of files) {
      const bytes = await readFile(file);
      const metadata = await sharp(bytes).metadata();
      const mime = {
        png: "image/png",
        jpeg: "image/jpeg",
        webp: "image/webp",
        avif: "image/avif",
      }[metadata.format];
      assert(mime, "Packing inputs must be PNG, JPEG, WebP or AVIF images.");
      const texture = this.original
        .createTexture(path.basename(file))
        .setMimeType(mime)
        .setImage(new Uint8Array(bytes));
      this.imported.add(texture);
    }
    this.before = await this.describe(this.original);
    return this.analysis();
  }
  materials(doc) {
    return doc
      .getRoot()
      .listMaterials()
      .map((material, id) => ({
        id,
        name: material.getName() || `Material ${id + 1}`,
        occlusion: doc
          .getRoot()
          .listTextures()
          .indexOf(material.getOcclusionTexture()),
        metallicRoughness: doc
          .getRoot()
          .listTextures()
          .indexOf(material.getMetallicRoughnessTexture()),
      }));
  }
  async describe(doc) {
    return Promise.all(
      doc
        .getRoot()
        .listTextures()
        .map(async (texture, index) => {
          const bytes = texture.getImage();
          let width = 0,
            height = 0,
            thumbnail = null,
            warning = null,
            channels = 0;
          try {
            if (texture.getMimeType() === "image/ktx2") {
              const ktx = readKTX(bytes);
              width = ktx.pixelWidth;
              height = ktx.pixelHeight;
            } else {
              const meta = await sharp(bytes).metadata();
              width = meta.width;
              height = meta.height;
              channels = meta.channels;
              thumbnail =
                "data:image/png;base64," +
                (
                  await sharp(bytes)
                    .resize(192, 192, {
                      fit: "inside",
                      withoutEnlargement: true,
                    })
                    .png()
                    .toBuffer()
                ).toString("base64");
            }
          } catch (error) {
            warning = "Could not decode image: " + error.message;
          }
          const slots = listTextureSlots(texture);
          const uses = texture
            .listParents()
            .filter((parent) => parent.propertyType !== PropertyType.ROOT)
            .map(
              (parent) =>
                parent.getName() || parent.extensionName || parent.propertyType,
            );
          const infos = listTextureInfo(texture).map((info) => ({
            uv: info.getTexCoord(),
            wrapS: info.getWrapS(),
            wrapT: info.getWrapT(),
            minFilter: info.getMinFilter(),
            magFilter: info.getMagFilter(),
          }));
          const color = getTextureColorSpace(texture) === "srgb";
          const colorSlots = slots.filter((slot) =>
            /baseColor|emissive|diffuse|specularColor|sheenColor/i.test(slot),
          );
          const dataSlots = slots.filter((slot) => !colorSlots.includes(slot));
          if (colorSlots.length && dataSlots.length)
            warning =
              "Shared between color and data slots. Split this image before KTX2 conversion.";
          return {
            id: index,
            inputOnly: this.imported?.has(texture) || false,
            name:
              texture.getName() || texture.getURI() || `Texture ${index + 1}`,
            uri: texture.getURI(),
            mime: texture.getMimeType(),
            width,
            height,
            channels,
            bytes: bytes?.byteLength || 0,
            thumbnail,
            slots,
            uses: [...new Set(uses)],
            infos,
            colorSpace: color ? "sRGB" : "Linear / data",
            warning,
            editable: texture.getMimeType() !== "image/ktx2" && !warning,
          };
        }),
    );
  }
  texture(id, output = false) {
    const doc = output ? this.resultDoc : this.original;
    const texture = doc?.getRoot().listTextures()[id];
    assert(texture, "Unknown texture.");
    return { bytes: texture.getImage(), mime: texture.getMimeType() };
  }
  async optimize(plan, progress = () => {}) {
    assert(this.original, "Open a model first.");
    assert(
      ["none", "draco", "meshopt"].includes(plan.geometry),
      "Invalid geometry compression.",
    );
    const geometryOptions = geometryCompression(plan.geometryOptions);
    const doc = cloneDocument(this.original);
    // glTF permits omitted inverse-bind matrices (identity). Quantization needs explicit accessors.
    for (const skin of doc.getRoot().listSkins()) {
      if (skin.getInverseBindMatrices()) continue;
      const values = new Float32Array(skin.listJoints().length * 16);
      for (let i = 0; i < skin.listJoints().length; i++)
        for (let j = 0; j < 4; j++) values[i * 16 + j * 5] = 1;
      skin.setInverseBindMatrices(
        doc
          .createAccessor()
          .setType("MAT4")
          .setArray(values)
          .setBuffer(doc.getRoot().listBuffers()[0] || doc.createBuffer()),
      );
    }
    const sourceTextures = doc.getRoot().listTextures();
    const ids = new Map(
      sourceTextures.map((texture, index) => [texture, `t${index}`]),
    );
    const changes = new Map();
    assert(
      Array.isArray(plan.textures) &&
        plan.textures.length <= sourceTextures.length,
      "Invalid texture settings.",
    );
    for (const settings of plan.textures) {
      const texture = sourceTextures[settings.id];
      assert(
        texture && !changes.has(texture),
        "Unknown or duplicated texture setting.",
      );
      assert(
        ["keep", "png", "jpeg", "webp", "etc1s", "uastc"].includes(
          settings.format,
        ),
        "Invalid texture format.",
      );
      assert(
        Number.isInteger(settings.maxSize) &&
          settings.maxSize >= 0 &&
          settings.maxSize <= 8192,
        "Maximum texture size must be between 0 and 8192.",
      );
      if (settings.format !== "keep" || settings.maxSize) {
        assert(
          texture.getMimeType() !== "image/ktx2",
          "Existing KTX2 images can be inspected and preserved. Reimport the source PNG/JPEG to resize or re-encode.",
        );
        changes.set(texture, settings);
      }
    }
    const packed = [];
    for (const [packIndex, pack] of (plan.packs || []).entries()) {
      progress(`Packing texture ${packIndex + 1}…`);
      const material = doc.getRoot().listMaterials()[pack.material];
      assert(material, "Choose a material for the packed texture.");
      assert(
        ["orm", "baseColor", "emissive", "normal"].includes(pack.target),
        "Invalid packing target.",
      );
      assert(
        Number.isInteger(pack.size) && pack.size >= 16 && pack.size <= 8192,
        "Packed size must be between 16 and 8192.",
      );
      assert(
        Array.isArray(pack.channels) && pack.channels.length === 4,
        "Choose four channel sources.",
      );
      const pixelCount = pack.size * pack.size;
      const pixels = Buffer.alloc(pixelCount * 4);
      const sourceSet = new Set();
      const decoded = new Map();
      for (const [channel, selection] of pack.channels.entries()) {
        if (selection.texture === null) {
          assert(
            Number.isFinite(selection.value) &&
              selection.value >= 0 &&
              selection.value <= 255,
            "Channel constants must be between 0 and 255.",
          );
          for (let i = 0; i < pixelCount; i++)
            pixels[i * 4 + channel] = Math.round(selection.value);
          continue;
        }
        const source = sourceTextures[selection.texture];
        assert(
          source && source.getMimeType() !== "image/ktx2",
          "Packing requires a PNG, JPEG, WebP or AVIF source.",
        );
        assert(
          Number.isInteger(selection.channel) &&
            selection.channel >= 0 &&
            selection.channel <= 3,
          "Invalid input channel.",
        );
        sourceSet.add(source);
        if (!decoded.has(source))
          decoded.set(
            source,
            await sharp(source.getImage())
              .resize(pack.size, pack.size, { fit: "fill" })
              .ensureAlpha()
              .raw()
              .toBuffer(),
          );
        const rgba = decoded.get(source);
        for (let i = 0; i < pixelCount; i++)
          pixels[i * 4 + channel] = rgba[i * 4 + selection.channel];
      }
      const png = await sharp(pixels, {
        raw: { width: pack.size, height: pack.size, channels: 4 },
      })
        .png()
        .toBuffer();
      const texture = doc
        .createTexture(pack.name || `Packed ${pack.target.toUpperCase()}`)
        .setMimeType("image/png")
        .setImage(png);
      ids.set(texture, `p${packIndex}`);
      if (pack.target === "orm") {
        const ao = material.getOcclusionTextureInfo(),
          mr = material.getMetallicRoughnessTextureInfo();
        const signature = (info) =>
          info
            ? JSON.stringify([
                info.getTexCoord(),
                info.getWrapS(),
                info.getWrapT(),
                info.getMinFilter(),
                info.getMagFilter(),
                info.getExtension("KHR_texture_transform")?.getOffset(),
                info.getExtension("KHR_texture_transform")?.getScale(),
                info.getExtension("KHR_texture_transform")?.getRotation(),
                info.getExtension("KHR_texture_transform")?.getTexCoord(),
              ])
            : null;
        assert(
          !ao || !mr || signature(ao) === signature(mr),
          "ORM inputs use different UVs, transforms or samplers. Align them before packing.",
        );
        // Preserve existing texture infos; copy when a previously empty slot is created.
        const reference = ao?.clone() || mr?.clone();
        material
          .setOcclusionTexture(texture)
          .setMetallicRoughnessTexture(texture);
        if (reference && !ao)
          material.getOcclusionTextureInfo().copy(reference);
        if (reference && !mr)
          material.getMetallicRoughnessTextureInfo().copy(reference);
        reference?.dispose();
      } else {
        const setter = {
          baseColor: "setBaseColorTexture",
          emissive: "setEmissiveTexture",
          normal: "setNormalTexture",
        }[pack.target];
        material[setter](texture);
      }
      packed.push({ texture, sources: [...sourceSet] });
      changes.set(texture, {
        format: pack.format || "png",
        maxSize: 0,
        compression: pack.compression,
      });
    }
    for (const { sources } of packed)
      for (const source of sources) {
        if (
          source
            .listParents()
            .every((parent) => parent.propertyType === PropertyType.ROOT)
        ) {
          changes.delete(source);
          source.dispose();
        }
      }
    for (const [index, original] of this.original
      .getRoot()
      .listTextures()
      .entries()) {
      const texture = sourceTextures[index];
      if (
        this.imported.has(original) &&
        texture
          .listParents()
          .every((parent) => parent.propertyType === PropertyType.ROOT) &&
        !texture.isDisposed()
      ) {
        changes.delete(texture);
        texture.dispose();
      }
    }
    for (const [texture, settings] of changes) {
      progress(
        `Processing ${texture.getName() || texture.getURI() || ids.get(texture)}…`,
      );
      const options = textureCompression(settings.format, settings.compression);
      const row = await this.describeTextureSafety(texture);
      const isKtx = settings.format === "etc1s" || settings.format === "uastc";
      if (isKtx)
        assert(
          !row.mixed,
          "A texture shared by sRGB color and linear data slots cannot be encoded to KTX2. Split its uses first.",
        );
      let image = Buffer.from(texture.getImage());
      let pipeline = sharp(image);
      if (settings.maxSize)
        pipeline = pipeline.resize(settings.maxSize, settings.maxSize, {
          fit: "inside",
          withoutEnlargement: true,
        });
      let format = settings.format;
      if (format === "keep")
        format = {
          "image/png": "png",
          "image/jpeg": "jpeg",
          "image/webp": "webp",
          "image/avif": "avif",
        }[texture.getMimeType()];
      assert(format, "Unsupported source image format.");
      if (isKtx) {
        image = await pipeline.png().toBuffer();
        const meta = await sharp(image).metadata();
        assert(
          meta.width % 4 === 0 && meta.height % 4 === 0,
          "KTX2 glTF textures must have dimensions divisible by 4. Choose a compatible resize size.",
        );
        image = await encodeToKTX2(image, {
          imageDecoder,
          isUASTC: format === "uastc",
          isNormalMap: listTextureSlots(texture).includes("normalTexture"),
          isPerceptual: row.color,
          isSetKTX2SRGBTransferFunc: row.color,
          enableDebug: false,
          generateMipmap: options.mipmaps,
          qualityLevel: options.quality,
          compressionLevel: options.effort,
          uastcLDRQualityLevel: options.uastcLevel,
          enableRDO: options.rdo,
          rdoQualityLevel: options.rdoLambda,
        });
        texture.setMimeType("image/ktx2");
        doc.createExtension(KHRTextureBasisu).setRequired(true);
        if (!options.mipmaps)
          for (const info of listTextureInfo(texture)) {
            const filter = info.getMinFilter();
            info.setMinFilter(
              [9728, 9984, 9986].includes(filter) ? 9728 : 9729,
            );
          }
      } else {
        if (format === "jpeg") {
          const stats = await pipeline.clone().stats();
          assert(
            stats.isOpaque,
            "JPEG would discard alpha. Use PNG, WebP or KTX2 for transparent textures.",
          );
        }
        image = await pipeline
          .toFormat(format, {
            quality: options.quality,
            ...(format === "png" ? { compressionLevel: options.pngLevel } : {}),
            ...(format === "webp"
              ? { effort: options.effort, lossless: options.lossless }
              : {}),
          })
          .toBuffer();
        texture.setMimeType(`image/${format}`);
        if (format === "webp")
          doc.createExtension(EXTTextureWebP).setRequired(true);
        if (format === "avif")
          doc.createExtension(EXTTextureAVIF).setRequired(true);
      }
      texture.setImage(new Uint8Array(image));
      texture.setURI("");
    }
    const optimization = normalizeOptimization(plan.optimization);
    const lodBase = optimization.lods.length ? cloneDocument(doc) : null;
    const geometryResult = await optimizeGeometry(doc, optimization, progress);
    // Always remove old geometry compression so each trial starts from decoded source data.
    for (const extension of doc.getRoot().listExtensionsUsed())
      if (
        ["KHR_draco_mesh_compression", "EXT_meshopt_compression"].includes(
          extension.extensionName,
        )
      )
        extension.dispose();
    progress("Compressing geometry…");
    if (plan.geometry === "draco")
      await doc.transform(
        weld(),
        draco({
          method: "edgebreaker",
          encodeSpeed: geometryOptions.encodeSpeed,
          decodeSpeed: geometryOptions.decodeSpeed,
          quantizePosition: geometryOptions.quantizePosition,
          quantizeNormal: geometryOptions.quantizeNormal,
          quantizeTexcoord: geometryOptions.quantizeTexcoord,
        }),
      );
    if (plan.geometry === "meshopt")
      await doc.transform(
        meshopt({
          encoder: MeshoptEncoder,
          level: geometryOptions.meshoptLevel,
        }),
      );
    // GLB requires one buffer. Keep accessors and animation semantics intact.
    const buffers = doc.getRoot().listBuffers();
    if (buffers.length > 1) {
      for (const accessor of doc.getRoot().listAccessors())
        accessor.setBuffer(buffers[0]);
      for (const buffer of buffers.slice(1)) buffer.dispose();
    }
    progress("Measuring output…");
    const output = await this.io.writeBinary(doc);
    this.lods = [];
    for (const [index, lodRatio] of optimization.lods.entries()) {
      progress(`Generating LOD ${index + 1}…`);
      const lod = cloneDocument(lodBase);
      await optimizeGeometry(
        lod,
        {
          ...optimization,
          lods: [],
          ratio: Math.max(0.01, optimization.ratio * lodRatio),
          meshes: optimization.meshes.map((mesh) => ({
            ...mesh,
            ratio: Math.max(
              0.01,
              (mesh.ratio ?? optimization.ratio) * lodRatio,
            ),
          })),
        },
        progress,
      );
      for (const extension of lod.getRoot().listExtensionsUsed())
        if (
          ["KHR_draco_mesh_compression", "EXT_meshopt_compression"].includes(
            extension.extensionName,
          )
        )
          extension.dispose();
      if (plan.geometry === "draco")
        await lod.transform(
          weld(),
          draco({
            method: "edgebreaker",
            encodeSpeed: geometryOptions.encodeSpeed,
            decodeSpeed: geometryOptions.decodeSpeed,
            quantizePosition: geometryOptions.quantizePosition,
            quantizeNormal: geometryOptions.quantizeNormal,
            quantizeTexcoord: geometryOptions.quantizeTexcoord,
          }),
        );
      if (plan.geometry === "meshopt")
        await lod.transform(
          meshopt({
            encoder: MeshoptEncoder,
            level: geometryOptions.meshoptLevel,
          }),
        );
      const buffers = lod.getRoot().listBuffers();
      if (buffers.length > 1) {
        for (const accessor of lod.getRoot().listAccessors())
          accessor.setBuffer(buffers[0]);
        buffers.slice(1).forEach((buffer) => buffer.dispose());
      }
      const bytes = await this.io.writeBinary(lod);
      this.lods.push({
        name: `model-lod${index + 1}.glb`,
        ratio: lodRatio,
        bytes,
        meshes: meshRows(lod),
      });
    }
    const after = await this.describe(doc);
    const outputTextures = doc.getRoot().listTextures();
    const mappings = new Map(
      outputTextures.map((texture, index) => [ids.get(texture), index]),
    );
    const comparisons = this.before.map((before, index) => {
      const outputId = mappings.get(`t${index}`);
      const next = outputId === undefined ? null : after[outputId];
      return {
        key: `t${index}`,
        name: before.name,
        beforeBytes: before.inputOnly ? 0 : before.bytes,
        afterBytes: next?.bytes || 0,
        beforeWidth: before.width,
        beforeHeight: before.height,
        outputId: outputId ?? null,
        after: next,
      };
    });
    for (const [index, row] of after.entries())
      if (ids.get(outputTextures[index])?.startsWith("p"))
        comparisons.push({
          key: ids.get(outputTextures[index]),
          name: row.name,
          beforeBytes: 0,
          afterBytes: row.bytes,
          beforeWidth: 0,
          beforeHeight: 0,
          outputId: index,
          after: row,
        });
    this.resultDoc = doc;
    this.output = output;
    const beforeTextures = this.before.reduce(
        (sum, row) => sum + (row.inputOnly ? 0 : row.bytes),
        0,
      ),
      afterTextures = after.reduce((sum, row) => sum + row.bytes, 0);
    this.report = {
      beforeBytes: this.beforeBytes,
      afterBytes: output.byteLength,
      beforeTextureBytes: beforeTextures,
      afterTextureBytes: afterTextures,
      comparisons,
      textures: after,
      geometry: plan.geometry,
      warnings: geometryResult.warnings,
      beforeMeshes: meshRows(this.original),
      afterMeshes: meshRows(doc),
      lods: this.lods.map(({ bytes, ...lod }) => ({
        ...lod,
        size: bytes.byteLength,
      })),
      appliedSettings: {
        geometryOptions,
        optimization,
        textures: plan.textures,
        packs: plan.packs || [],
      },
    };
    return this.report;
  }
  async describeTextureSafety(texture) {
    const slots = listTextureSlots(texture);
    const color = slots.some((slot) =>
      /baseColor|emissive|diffuse|specularColor|sheenColor/i.test(slot),
    );
    return {
      color,
      mixed:
        color &&
        slots.some(
          (slot) =>
            !/baseColor|emissive|diffuse|specularColor|sheenColor/i.test(slot),
        ),
    };
  }
}
