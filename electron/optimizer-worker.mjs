import { parentPort } from "node:worker_threads";
import { checkModel } from "./pipeline/checks.mjs";
import { Optimizer } from "./optimizer.mjs";
const optimizer = new Optimizer();
parentPort.on("message", async ({ id, method, args }) => {
  try {
    let result;
    if (method === "analyze") result = await optimizer.open(args);
    else if (method === "importImages")
      result = await optimizer.importImages(args);
    else if (method === "optimize")
      result = await optimizer.optimize(args, (message) =>
        parentPort.postMessage({ progress: message }),
      );
    else if (method === "texture")
      result = optimizer.texture(args.id, args.output);
    else if (method === "restore") {
      optimizer.output = args.bytes;
      optimizer.report = args.report;
      optimizer.lods = args.lods;
      optimizer.resultDoc = await optimizer.io.readBinary(args.bytes);
      result = args.report;
    } else if (method === "output") result = optimizer.output;
    else if (method === "checks") {
      if (args.output && !optimizer.output)
        throw new Error("Run optimization before validating output.");
      result = await checkModel(
        args.file,
        args.output ? optimizer.output : undefined,
      );
    } else if (method === "bundle")
      result = {
        bytes: optimizer.output,
        lods: optimizer.lods || [],
        report: optimizer.report,
      };
    else throw new Error("Unknown optimizer operation.");
    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
