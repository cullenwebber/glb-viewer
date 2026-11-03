import { parentPort, workerData } from "node:worker_threads";
import { runBatch } from "./pipeline/batch.mjs";
runBatch(workerData, (row) => parentPort.postMessage({ row }))
  .then((result) => parentPort.postMessage({ result }))
  .catch((error) => parentPort.postMessage({ error: error.message }));
