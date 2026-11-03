const fs = require("node:fs/promises"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const fields = ["fileBytes", "textureBytes", "triangles", "drawCalls"];
function budgetResults(budget, metrics) {
  return fields
    .filter((key) => budget[key] > 0)
    .map((key) => ({
      key,
      limit: budget[key],
      actual: metrics[key] ?? null,
      exceeded: metrics[key] != null && metrics[key] > budget[key],
    }));
}
function createBudgets(directory) {
  const file = path.join(directory, "budgets.json");
  let queue = Promise.resolve();
  async function read() {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  const edit = (fn) => {
    const result = queue.then(async () => {
      const rows = await read(),
        value = fn(rows);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(file + ".tmp", JSON.stringify(rows));
      await fs.rename(file + ".tmp", file);
      return value;
    });
    queue = result.catch(() => {});
    return result;
  };
  return {
    list: async () => {
      await queue;
      return read();
    },
    save: (input) =>
      edit((rows) => {
        const name = String(input.name || "")
          .trim()
          .slice(0, 100);
        if (!name) throw new Error("Enter a budget name.");
        const row = {
          id: rows.find((r) => r.id === input.id)?.id || randomUUID(),
          name,
        };
        for (const key of fields) {
          const value = Number(input[key] || 0);
          if (!Number.isSafeInteger(value) || value < 0)
            throw new Error("Budget limits must be nonnegative whole numbers.");
          row[key] = value;
        }
        const index = rows.findIndex((r) => r.id === row.id);
        if (index < 0) rows.push(row);
        else rows[index] = row;
        return row;
      }),
    delete: (id) =>
      edit((rows) => {
        const index = rows.findIndex((r) => r.id === id);
        if (index >= 0) rows.splice(index, 1);
      }),
  };
}
module.exports = { createBudgets, budgetResults };
