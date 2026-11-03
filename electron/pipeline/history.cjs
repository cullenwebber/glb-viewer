const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
function createHistory(directory) {
  const root = path.join(directory, "history");
  let queue = Promise.resolve();
  const valid = (id) => {
    if (!/^[a-f\d-]{36}$/.test(id)) throw new Error("Invalid history entry.");
    return path.join(root, id);
  };
  const read = async (id) =>
    JSON.parse(await fs.readFile(path.join(valid(id), "run.json"), "utf8"));
  async function list(sourceKey) {
    await queue;
    let entries = [];
    try {
      entries = await fs.readdir(root);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const rows = [];
    for (const id of entries) {
      try {
        const row = await read(id);
        if (row.sourceKey === sourceKey) rows.push(row);
      } catch {}
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  function edit(fn) {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  }
  return {
    list,
    save: (sourceKey, name, recipe, data) =>
      edit(async () => {
        const id = randomUUID(),
          folder = valid(id);
        await fs.mkdir(folder, { recursive: true });
        try {
          await fs.writeFile(path.join(folder, "model.glb"), data.bytes);
          for (const [index, lod] of (data.lods || []).entries())
            await fs.writeFile(
              path.join(folder, `lod-${index}.glb`),
              lod.bytes,
            );
          const row = {
            id,
            sourceKey,
            name,
            createdAt: new Date().toISOString(),
            recipe,
            report: data.report,
            lods: (data.lods || []).map(({ bytes, ...rest }) => rest),
          };
          await fs.writeFile(
            path.join(folder, "run.json"),
            JSON.stringify(row),
          );
          return row;
        } catch (error) {
          await fs.rm(folder, { recursive: true, force: true });
          throw error;
        }
      }),
    rename: (id, name) =>
      edit(async () => {
        const row = await read(id);
        row.name = String(name).trim().slice(0, 100);
        if (!row.name) throw new Error("Enter a run name.");
        const file = path.join(valid(id), "run.json");
        await fs.writeFile(file + ".tmp", JSON.stringify(row));
        await fs.rename(file + ".tmp", file);
        return row;
      }),
    delete: (id) =>
      edit(() => fs.rm(valid(id), { recursive: true, force: true })),
    bytes: async (id) => {
      await queue;
      return new Uint8Array(
        await fs.readFile(path.join(valid(id), "model.glb")),
      );
    },
    get: async (id) => {
      await queue;
      const row = await read(id),
        folder = valid(id);
      return {
        ...row,
        bytes: new Uint8Array(
          await fs.readFile(path.join(folder, "model.glb")),
        ),
        lods: await Promise.all(
          row.lods.map(async (lod, index) => ({
            ...lod,
            bytes: new Uint8Array(
              await fs.readFile(path.join(folder, `lod-${index}.glb`)),
            ),
          })),
        ),
      };
    },
  };
}
module.exports = { createHistory };
