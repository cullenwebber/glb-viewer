// Use bundled workers with a worker-only CSP that permits Emscripten bindings.
// The renderer itself never enables unsafe-eval.
export function useBundledWorker(
  loader: unknown,
  method: "init" | "_initDecoder",
  filename: string,
) {
  const internal = loader as {
    init: () => Promise<void>;
    _initDecoder: () => Promise<void>;
    workerSourceURL: string;
  };
  const initialize = internal[method].bind(internal);
  internal[method] = async () => {
    await initialize();
    if (internal.workerSourceURL.startsWith("blob:"))
      URL.revokeObjectURL(internal.workerSourceURL);
    internal.workerSourceURL = new URL(
      "./decoders/" + filename,
      window.location.href,
    ).href;
  };
}
