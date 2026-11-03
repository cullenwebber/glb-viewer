const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
class ModelWatcher {
  constructor(onChange, onError) {
    this.onChange = onChange;
    this.onError = onError;
    this.enabled = false;
    this.targets = new Set();
    this.serial = 0;
  }
  async start(file) {
    this.stop();
    this.file = file;
    this.targets = new Set([file]);
    this.enabled = true;
    const serial = this.serial;
    try {
      this.fingerprints = await this.hashes();
      this.watcher = fs.watch(
        path.dirname(file),
        { recursive: true },
        (_event, name) => {
          if (!name) return;
          const changed = path.resolve(path.dirname(file), String(name));
          if (this.targets.has(changed)) {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.settle(serial), 500);
          }
        },
      );
      this.watcher.on("error", (error) => {
        this.onError(error.message);
        this.stop();
      });
    } catch (error) {
      this.stop();
      throw error;
    }
    return this.state();
  }
  async hashes() {
    const source = await fsp.readFile(this.file);
    let json;
    if (source.length >= 20 && source.readUInt32LE(0) === 0x46546c67) {
      const length = source.readUInt32LE(12);
      json = JSON.parse(source.subarray(20, 20 + length).toString("utf8"));
    } else json = JSON.parse(source.toString("utf8"));
    const root = path.dirname(this.file);
    const targets = new Set([this.file]);
    for (const resource of [...(json.buffers || []), ...(json.images || [])]) {
      const uri = resource.uri;
      if (!uri || /^[a-z][a-z0-9+.-]*:/i.test(uri)) continue;
      const target = path.resolve(root, decodeURIComponent(uri)),
        relative = path.relative(root, target);
      if (
        relative !== ".." &&
        !relative.startsWith(".." + path.sep) &&
        !path.isAbsolute(relative)
      ) {
        const resolved = await fsp.realpath(target),
          actual = path.relative(root, resolved);
        if (
          actual === ".." ||
          actual.startsWith(".." + path.sep) ||
          path.isAbsolute(actual)
        )
          throw new Error("A watched resource is outside the model directory.");
        targets.add(resolved);
      }
    }
    this.targets = targets;
    const entries = await Promise.all(
      [...this.targets].sort().map(async (file) => [
        file,
        createHash("sha256")
          .update(await fsp.readFile(file))
          .digest("hex"),
      ]),
    );
    return JSON.stringify(entries);
  }
  async setTargets(files) {
    if (!this.enabled) return;
    this.targets = new Set([this.file, ...files]);
    try {
      this.fingerprints = await this.hashes();
    } catch {}
  }
  async settle(serial, attempt = 0, previous) {
    if (!this.enabled || serial !== this.serial) return;
    try {
      const fingerprint = await this.hashes();
      if (fingerprint !== previous) {
        if (attempt >= 10)
          throw new Error(
            "Export is still changing. Waiting for the next file update.",
          );
        this.timer = setTimeout(
          () => this.settle(serial, attempt + 1, fingerprint),
          400,
        );
        return;
      }
      if (fingerprint === this.fingerprints) return;
      this.fingerprints = fingerprint;
      await this.onChange(this.file);
    } catch (error) {
      if (attempt < 10)
        this.timer = setTimeout(
          () => this.settle(serial, attempt + 1, previous),
          400,
        );
      else this.onError(error.message);
    }
  }
  stop() {
    this.serial++;
    this.enabled = false;
    clearTimeout(this.timer);
    this.watcher?.close();
    this.watcher = null;
  }
  state() {
    return {
      enabled: this.enabled,
      name: this.file ? path.basename(this.file) : null,
    };
  }
}
module.exports = { ModelWatcher };
