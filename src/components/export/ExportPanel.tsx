import { Download, FolderOutput } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { bytesLabel } from "@/lib/format";
import type { WorkbenchState } from "@/hooks/use-workbench";
export function ExportPanel({ workbench: w }: { workbench: WorkbenchState }) {
  const ready = !!w.report && !w.dirty && w.phase === "idle";
  return (
    <div className="utility-page">
      <div className="utility-heading">
        <div>
          <h2>Export to Three.js</h2>
          <p>
            A model, its decoder assets, and a loader ready to adapt to your
            project.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-section">
          <h3>Blender bridge</h3>
          <p>
            Install the add-on in Blender 4.2 or newer. Choose an output folder,
            send your model, then open model.glb here and enable Watch exports.
            Supported material graphs preview as TSL; unsupported graphs retain
            glTF fallback materials with diagnostics under Surface inspection.
            Include scene cameras and Point/Spot/Sun lights, then use the
            viewport camera selector and Camera/light helpers to inspect them.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <a href="./glb-viewer-bridge.zip" download>
              <Download />
              Download Blender add-on
            </a>
          </Button>
        </section>
        <section className="settings-section">
          <h3>Optimized GLB</h3>
          <p>
            One self-contained file, preserving original source files. Use the
            decoder setup required by your selected codecs.
          </p>
          <Button
            id="export-single"
            variant="outline"
            className="mt-4"
            disabled={!ready}
            onClick={w.exportModel}
          >
            <Download />
            Save GLB…
          </Button>
        </section>
        <section className="settings-section">
          <h3>Three.js bundle</h3>
          <p>
            Creates a new folder with model.glb, optional LOD models, bundled
            Draco and Basis decoders, a vanilla TypeScript loader, a React Three
            Fiber component, a TSL material translator, typed animation and
            object lookups, the measured report, and integration instructions.
          </p>
          <Button
            id="export-bundle"
            className="mt-4"
            disabled={!ready}
            onClick={w.exportBundle}
          >
            <FolderOutput />
            Export Three.js bundle…
          </Button>
        </section>
      </div>
      {!ready && (
        <p className="report-note">
          {w.dirty
            ? "Settings have changed. Run optimization to update the export."
            : "Run optimization to prepare the export."}
        </p>
      )}
      {w.report && (
        <>
          <div className="metric-strip mt-7">
            <div>
              <span>Original model</span>
              <strong>{bytesLabel(w.report.beforeBytes)}</strong>
            </div>
            <div>
              <span>Optimized model</span>
              <strong>{bytesLabel(w.report.afterBytes)}</strong>
            </div>
            <div>
              <span>Additional LODs</span>
              <strong>{w.report.lods?.length || 0}</strong>
            </div>
          </div>
          {!!w.report.lods?.length && (
            <Table className="mt-6">
              <TableHeader>
                <TableRow>
                  <TableHead>LOD file</TableHead>
                  <TableHead>Target relative to base</TableHead>
                  <TableHead>Measured size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {w.report.lods.map((lod) => (
                  <TableRow key={lod.name}>
                    <TableCell className="text-xs">{lod.name}</TableCell>
                    <TableCell className="text-xs">
                      {lod.ratio * 100}%
                    </TableCell>
                    <TableCell className="text-xs">
                      {bytesLabel(lod.size)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
      <section className="settings-section mt-8">
        <h3>Integration notes</h3>
        <p>
          The bundle pins the Three.js version used by this viewer. Use its
          matching decoder files, or replace the decoder assets to match your
          project's version. Lighting, tone mapping, and LOD distances belong to
          your application.
        </p>
        <p>
          The generated loader returns an AnimationMixer and a disposal
          function. Read assets.json for clip and object names; the report
          records the options applied to the export.
        </p>
      </section>
    </div>
  );
}
