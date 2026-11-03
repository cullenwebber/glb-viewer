import type { Analysis, Plan, Recipe, TextureInfo } from "@/model-types";
export function textureIdentity(texture: TextureInfo) {
  return JSON.stringify([
    texture.uri || texture.name,
    [...texture.slots].sort(),
    [...texture.uses].sort(),
  ]);
}
export function createRecipe(analysis: Analysis, plan: Plan): Recipe {
  return {
    version: 1,
    geometry: plan.geometry,
    geometryOptions: plan.geometryOptions || {},
    optimization: plan.optimization || {},
    textureRules: plan.textures.map((setting) => {
      const { id, ...settings } = setting;
      const texture = analysis.textures.find((texture) => texture.id === id)!;
      return {
        identity: textureIdentity(texture),
        slots: texture.slots,
        settings,
      };
    }),
    packs: plan.packs.map((pack) => ({
      ...pack,
      material:
        analysis.materials.find((material) => material.id === pack.material)
          ?.name || "",
      channels: pack.channels.map((source) => ({
        channel: source.channel,
        value: source.value,
        identity:
          source.texture === null
            ? null
            : textureIdentity(
                analysis.textures.find(
                  (texture) => texture.id === source.texture,
                )!,
              ),
      })),
    })),
  };
}
export function applyRecipe(
  analysis: Analysis,
  recipe: Recipe,
): { plan: Plan; warnings: string[] } {
  const warnings: string[] = [];
  const settings = analysis.textures.map((texture) => {
    const identity = textureIdentity(texture),
      exact = recipe.textureRules.filter((rule) => rule.identity === identity);
    let rule = exact.length === 1 ? exact[0] : undefined;
    if (!rule && texture.slots.length) {
      const candidates = recipe.textureRules.filter(
        (rule) =>
          rule.slots.length &&
          rule.slots.some((slot) => texture.slots.includes(slot)),
      );
      if (
        candidates.length &&
        candidates.every(
          (candidate) =>
            JSON.stringify(candidate.settings) ===
            JSON.stringify(candidates[0].settings),
        )
      )
        rule = candidates[0];
      else if (candidates.length)
        warnings.push(`Skipped ambiguous role settings for ${texture.name}.`);
    }
    if (!rule) return { id: texture.id, maxSize: 0, format: "keep" };
    if (
      !texture.editable &&
      (rule.settings.format !== "keep" || rule.settings.maxSize)
    ) {
      warnings.push(
        `Kept ${texture.name}: it cannot be re-encoded from this source.`,
      );
      return { id: texture.id, maxSize: 0, format: "keep" };
    }
    return { ...rule.settings, id: texture.id };
  });
  const packs: Plan["packs"] = [];
  for (const pack of recipe.packs) {
    const materials = analysis.materials.filter(
      (material) => material.name === pack.material,
    );
    if (materials.length !== 1) {
      warnings.push(
        `Skipped ${pack.name}: material name does not match uniquely.`,
      );
      continue;
    }
    let missing = false;
    const channels = pack.channels.map((source) => {
      if (source.identity === null)
        return { texture: null, channel: source.channel, value: source.value };
      const candidates = analysis.textures.filter(
        (texture) => textureIdentity(texture) === source.identity,
      );
      if (candidates.length !== 1) {
        missing = true;
        return { texture: null, channel: source.channel, value: source.value };
      }
      return {
        texture: candidates[0].id,
        channel: source.channel,
        value: source.value,
      };
    });
    if (missing) {
      warnings.push(
        `Skipped ${pack.name}: reimport its missing or ambiguous packing inputs.`,
      );
      continue;
    }
    packs.push({ ...pack, material: materials[0].id, channels });
  }
  const meshKeys = new Set(analysis.meshes.map((mesh) => mesh.key));
  const overrides = (recipe.optimization.meshes || []).filter((mesh) =>
    meshKeys.has(mesh.key),
  );
  if (overrides.length !== (recipe.optimization.meshes || []).length)
    warnings.push(
      "Some mesh overrides did not match the new model and were skipped.",
    );
  return {
    plan: {
      geometry: recipe.geometry,
      geometryOptions: recipe.geometryOptions,
      optimization: {
        ...recipe.optimization,
        meshes: overrides,
        singleSided: (recipe.optimization.singleSided || []).filter(
          (target) =>
            analysis.meshes.filter((mesh) => mesh.key === target.key).length ===
            1,
        ),
      },
      textures: settings,
      packs,
    },
    warnings,
  };
}
