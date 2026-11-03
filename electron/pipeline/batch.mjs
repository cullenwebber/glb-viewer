import fs from "node:fs/promises";
import path from "node:path";
import { Optimizer } from "../optimizer.mjs";
import { checkModel } from "./checks.mjs";
import { budgetResults } from "./budgets.cjs";
export async function discoverModels(directory) {
  const root = await fs.realpath(directory),
    rows = [];
  async function visit(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (
        entry.isSymbolicLink() ||
        entry.name.startsWith(".") ||
        entry.name === "node_modules"
      )
        continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (/\.(glb|gltf)$/i.test(entry.name))
        rows.push({ file, relative: path.relative(root, file) });
      if (rows.length > 5000)
        throw new Error("Choose a smaller folder (maximum 5,000 models).");
    }
  }
  await visit(root);
  return rows.sort((a, b) => a.relative.localeCompare(b.relative));
}
const identity = (t) =>
  JSON.stringify([t.uri || t.name, [...t.slots].sort(), [...t.uses].sort()]);
export function batchPlan(analysis, recipe) {
  const warnings = [],
    textures = analysis.textures.map((texture) => {
      const exact = recipe.textureRules.filter(
        (r) => r.identity === identity(texture),
      );
      let rule = exact.length === 1 ? exact[0] : null;
      if (!rule) {
        const candidates = recipe.textureRules.filter((r) =>
          r.slots.some((s) => texture.slots.includes(s)),
        );
        if (
          candidates.length &&
          candidates.every(
            (r) =>
              JSON.stringify(r.settings) ===
              JSON.stringify(candidates[0].settings),
          )
        )
          rule = candidates[0];
        else if (candidates.length)
          warnings.push(`Ambiguous texture rules: ${texture.name}.`);
      }
      if (!rule || !texture.editable)
        return { id: texture.id, format: "keep", maxSize: 0 };
      return { ...rule.settings, id: texture.id };
    });
  const packs = [];
  for (const pack of recipe.packs) {
    const materials = analysis.materials.filter(
      (m) => m.name === pack.material,
    );
    let missing = materials.length !== 1;
    const channels = pack.channels.map((source) => {
      if (source.identity === null)
        return { texture: null, channel: source.channel, value: source.value };
      const matches = analysis.textures.filter(
        (t) => identity(t) === source.identity,
      );
      if (matches.length !== 1) missing = true;
      return {
        texture: matches[0]?.id ?? null,
        channel: source.channel,
        value: source.value,
      };
    });
    if (missing)
      warnings.push(
        `Skipped ${pack.name}: missing or ambiguous material/texture inputs.`,
      );
    else packs.push({ ...pack, material: materials[0].id, channels });
  }
  const unique = (key) =>
    analysis.meshes.filter((m) => m.key === key).length === 1;
  return {
    warnings,
    plan: {
      geometry: recipe.geometry,
      geometryOptions: recipe.geometryOptions,
      optimization: {
        ...recipe.optimization,
        meshes: (recipe.optimization.meshes || []).filter((m) => unique(m.key)),
        singleSided: (recipe.optimization.singleSided || []).filter((m) =>
          unique(m.key),
        ),
      },
      textures,
      packs,
    },
  };
}
export async function runBatch(
  { jobs, output, recipe, budget },
  progress = () => {},
) {
  const rows = [];
  for (const [index, job] of jobs.entries()) {
    const row = { index, name: job.relative, status: "running" };
    progress({ ...row });
    try {
      const source = await checkModel(job.file);
      if (source.errors)
        throw new Error(`Source has ${source.errors} validation errors.`);
      const engine = new Optimizer(),
        analysis = await engine.open(job.file),
        mapped = batchPlan(analysis, recipe);
      const report = await engine.optimize(mapped.plan, (message) =>
        progress({ ...row, message }),
      );
      const checks = await checkModel(job.file, engine.output);
      if (checks.errors)
        throw new Error(
          `Output has ${checks.errors} validation errors; export skipped.`,
        );
      // Preserve relative directories and source extension to avoid foo.glb/foo.gltf collisions.
      const destination = path.join(output, job.relative + "-optimized.glb");
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination + ".partial", engine.output);
      await fs.rename(destination + ".partial", destination);
      const metrics = {
        fileBytes: report.afterBytes,
        triangles: report.afterMeshes.reduce((sum, m) => sum + m.triangles, 0),
        drawCalls: report.afterMeshes.reduce((sum, m) => sum + m.primitives, 0),
        textureBytes: report.textures.reduce(
          (sum, t) => sum + (t.width * t.height * 4 * 4) / 3,
          0,
        ),
      };
      Object.assign(row, {
        status: "complete",
        beforeBytes: report.beforeBytes,
        afterBytes: report.afterBytes,
        output: destination,
        warnings: [...mapped.warnings, ...(report.warnings || [])],
        checks: {
          errors: checks.errors,
          warnings: checks.warnings,
          infos: checks.infos,
        },
        budgets: budget ? budgetResults(budget, metrics) : [],
        metrics,
      });
      await fs.writeFile(
        destination + ".report.json",
        JSON.stringify({ ...row, report, validation: checks }, null, 2),
      );
    } catch (error) {
      Object.assign(row, { status: "failed", message: error.message });
    }
    rows.push(row);
    progress({ ...row });
    await fs.writeFile(
      path.join(output, "batch-report.json.partial"),
      JSON.stringify(
        {
          rows,
          budget,
          metricNote:
            "Draw calls are primitive estimates, texture memory assumes RGBA8 mipmaps. Instance counts, passes, and camera visibility affect actual rendering.",
        },
        null,
        2,
      ),
    );
    await fs.rename(
      path.join(output, "batch-report.json.partial"),
      path.join(output, "batch-report.json"),
    );
  }
  return { rows, output };
}
