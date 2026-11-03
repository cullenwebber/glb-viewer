function number(value, fallback, min, max, label, integer = true) {
  value ??= fallback;
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(
      `${label} must be ${integer ? "an integer" : "a number"} from ${min} to ${max}.`,
    );
  return value;
}
function boolean(value, fallback, label) {
  value ??= fallback;
  if (typeof value !== "boolean")
    throw new Error(`${label} must be enabled or disabled.`);
  return value;
}
export function textureCompression(format, input = {}) {
  return {
    quality: number(
      input.quality,
      format === "etc1s" ? 200 : 90,
      1,
      format === "etc1s" ? 255 : 100,
      "Texture quality",
    ),
    effort: number(
      input.effort,
      format === "etc1s" ? 2 : 4,
      0,
      6,
      "Encoder effort",
    ),
    uastcLevel: number(input.uastcLevel, 2, 0, 3, "UASTC effort"),
    rdo: boolean(input.rdo, false, "RDO"),
    rdoLambda: number(input.rdoLambda, 1, 0.01, 10, "RDO strength", false),
    mipmaps: boolean(input.mipmaps, true, "Mipmaps"),
    lossless: boolean(input.lossless, false, "Lossless"),
    pngLevel: number(input.pngLevel, 9, 0, 9, "PNG compression level"),
  };
}
export function geometryCompression(input = {}) {
  const level = input.meshoptLevel ?? "medium";
  if (!["medium", "high"].includes(level))
    throw new Error("Invalid Meshopt compression level.");
  return {
    meshoptLevel: level,
    encodeSpeed: number(input.encodeSpeed, 5, 0, 10, "Draco encode speed"),
    decodeSpeed: number(input.decodeSpeed, 5, 0, 10, "Draco decode speed"),
    quantizePosition: number(
      input.quantizePosition,
      14,
      1,
      30,
      "Position precision",
    ),
    quantizeNormal: number(input.quantizeNormal, 10, 1, 30, "Normal precision"),
    quantizeTexcoord: number(input.quantizeTexcoord, 12, 1, 30, "UV precision"),
  };
}
