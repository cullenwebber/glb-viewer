export function bytesLabel(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(2)} MB`;
}
export function savings(before: number, after: number) {
  if (!before) return "New texture";
  return `${(Math.abs(1 - after / before) * 100).toFixed(1)}% ${after <= before ? "smaller" : "larger"}`;
}
export function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
