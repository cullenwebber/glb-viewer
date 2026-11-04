const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
function createLibrary(directory) {
  const file = path.join(directory, "asset-library.json");
  let queue = Promise.resolve();
  async function read() {
    try {
      const data = JSON.parse(await fs.readFile(file, "utf8"));
      if (
        data.version !== 1 ||
        !Array.isArray(data.presets) ||
        typeof data.recipes !== "object"
      )
        throw new Error("Invalid preset library.");
      return data;
    } catch (error) {
      if (error.code === "ENOENT")
        return { version: 1, presets: [], recipes: {} };
      throw error;
    }
  }
  function edit(fn) {
    const operation = queue.then(async () => {
      const data = await read(),
        result = await fn(data);
      await fs.mkdir(directory, { recursive: true });
      const temp = file + "." + randomUUID() + ".tmp";
      await fs.writeFile(temp, JSON.stringify(data, null, 2));
      await fs.rename(temp, file);
      return result;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  function recipe(value) {
    if (
      !value ||
      value.version !== 1 ||
      !Array.isArray(value.textureRules) ||
      !Array.isArray(value.packs) ||
      !["none", "draco", "meshopt"].includes(value.geometry) ||
      JSON.stringify(value).length > 1024 * 1024
    )
      throw new Error("Invalid optimization recipe.");
    if (
      value.textureRules.length > 10000 ||
      value.packs.length > 256 ||
      value.textureRules.some(
        (rule) =>
          typeof rule.identity !== "string" ||
          !Array.isArray(rule.slots) ||
          !rule.settings ||
          typeof rule.settings.format !== "string" ||
          (rule.settings.remove !== undefined &&
            typeof rule.settings.remove !== "boolean"),
      ) ||
      value.packs.some(
        (pack) =>
          typeof pack.material !== "string" ||
          !Array.isArray(pack.channels) ||
          pack.channels.length !== 4 ||
          pack.channels.some(
            (channel) =>
              channel.identity !== null && typeof channel.identity !== "string",
          ),
      )
    )
      throw new Error("Invalid preset rules or channel references.");
    return structuredClone({
      ...value,
      geometryOptions: value.geometryOptions || {},
      optimization: value.optimization || {},
    });
  }
  return {
    list: async () => {
      await queue;
      return (await read()).presets;
    },
    save: ({ id, name, recipe: input }) =>
      edit((data) => {
        name = String(name || "")
          .trim()
          .slice(0, 100);
        if (!name) throw new Error("Enter a preset name.");
        const existing = data.presets.find((p) => p.id === id),
          preset = {
            id: existing?.id || randomUUID(),
            name,
            recipe: recipe(input),
            updatedAt: new Date().toISOString(),
          };
        data.presets = data.presets.filter((p) => p.id !== preset.id);
        data.presets.push(preset);
        return preset;
      }),
    delete: (id) =>
      edit((data) => {
        data.presets = data.presets.filter((p) => p.id !== id);
      }),
    getRecipe: async (key) => {
      await queue;
      return (await read()).recipes[key] || null;
    },
    saveRecipe: (key, input) =>
      edit((data) => {
        if (!/^[a-f\d]{32}$/.test(key))
          throw new Error("Invalid source identity.");
        data.recipes[key] = recipe(input);
      }),
  };
}
module.exports = { createLibrary };
