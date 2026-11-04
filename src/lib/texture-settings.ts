import type { TextureInfo, TextureSetting } from "../model-types";

export function textureSettingStatus(
  texture: TextureInfo,
  setting?: TextureSetting,
) {
  if (setting?.remove) return "removed";
  if (texture.inputOnly) return "input";
  if (setting && (setting.maxSize > 0 || setting.format !== "keep"))
    return "configured";
  return "unchanged";
}

export const textureStatusLabels = {
  configured: "Configured",
  unchanged: "Unchanged",
  removed: "Remove on export",
  input: "Packing input",
};
