import { Input } from "@/components/ui/input";
import type { ViewerController } from "@/hooks/use-model-viewer";
import { BlenderMaterialGraph } from "./BlenderMaterialGraph";

export function BlenderMaterials({ viewer }: { viewer: ViewerController }) {
  if (!viewer.state.bridgeMaterials.length) return null;
  return (
    <section className="mt-4">
      <h3 className="section-heading">Blender → TSL</h3>
      <p className="inspection-note">
        Live Value-node controls are preview-only. Edit Blender and re-export to
        publish changes.
      </p>
      {viewer.state.bridgeMaterials.map((report) => (
        <details
          key={report.key}
          className="mt-3 rounded border border-border p-3"
          open={report.status === "fallback"}
        >
          <summary className="text-xs cursor-pointer">
            {report.name} ·{" "}
            {report.status === "translated" ? "TSL" : "glTF fallback"}
          </summary>
          <p className="inspection-note">{report.message}</p>
          <BlenderMaterialGraph report={report} />
          {report.parameters.map((parameter) => (
            <label key={parameter.id} className="control-property">
              <span className="text-xs">{parameter.label}</span>
              <Input
                type="number"
                step="0.01"
                aria-label={`${report.name}: ${parameter.label}`}
                value={parameter.value}
                onChange={(event) => {
                  if (event.target.value !== "")
                    viewer.setMaterialParameter(
                      report.key,
                      parameter.id,
                      Number(event.target.value),
                    );
                }}
              />
            </label>
          ))}
          <ul className="text-xs text-muted-foreground space-y-1 mt-3">
            {report.nodes.map((node) => (
              <li key={node.id}>
                {node.label} · {node.type}
                {node.connected ? "" : " (unused)"}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
