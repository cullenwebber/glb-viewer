import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SizeComparisonChart } from "./SizeComparisonChart";
import { TextureSizeTable } from "./TextureSizeTable";
import { bytesLabel, savings, download } from "@/lib/format";
import type { Report } from "@/model-types";
export function SizeReport({
  report,
  source,
}: {
  report?: Report;
  source?: string;
}) {
  if (!report)
    return (
      <div className="workspace-empty">
        <h2 className="text-base font-medium text-foreground">
          Measure before you export
        </h2>
        <p className="max-w-sm leading-relaxed">
          Choose a geometry codec or set individual texture options, then run
          optimization to compare the result.
        </p>
      </div>
    );
  return (
    <div className="report-layout">
      <div className="report-heading">
        <div>
          <h2>Optimization result</h2>
          <p>
            {savings(report.beforeBytes, report.afterBytes)}.{" "}
            {report.geometry === "none"
              ? "Geometry preserved."
              : `${report.geometry === "draco" ? "Draco" : "Meshopt"} geometry compression.`}
          </p>
        </div>
        <Button
          id="wb-download-report"
          variant="outline"
          size="sm"
          onClick={() =>
            download(
              new TextEncoder().encode(
                JSON.stringify({ source, ...report }, null, 2),
              ),
              "optimization-report.json",
            )
          }
        >
          <Download />
          Download report
        </Button>
      </div>
      <div className="report-overview">
        <SizeComparisonChart
          before={report.beforeBytes}
          after={report.afterBytes}
        />
        <div className="space-y-6">
          <div className="report-totals">
            <div>
              <span>Original</span>
              <strong>{bytesLabel(report.beforeBytes)}</strong>
            </div>
            <div>
              <span>Optimized</span>
              <strong>{bytesLabel(report.afterBytes)}</strong>
            </div>
          </div>
          <dl className="property-list">
            <div>
              <dt>Image payload</dt>
              <dd>
                {bytesLabel(report.beforeTextureBytes)} →{" "}
                {bytesLabel(report.afterTextureBytes)}
              </dd>
            </div>
            <div>
              <dt>Geometry and other data</dt>
              <dd>
                {bytesLabel(
                  Math.max(0, report.beforeBytes - report.beforeTextureBytes),
                )}{" "}
                →{" "}
                {bytesLabel(
                  Math.max(0, report.afterBytes - report.afterTextureBytes),
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">Images</h3>
        <span className="text-xs text-muted-foreground">
          Largest original first
        </span>
      </div>
      <TextureSizeTable comparisons={report.comparisons} />
      <p className="report-note">
        Measured encoded bytes. Original size includes referenced external
        files; the output is one GLB.{" "}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="link"
              className="h-auto p-0 text-[11px] underline decoration-muted-foreground/40 underline-offset-4"
            >
              How sizes are measured
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm leading-relaxed">
            Image rows measure encoded payload, not GPU memory. Duplicate
            references may appear in several rows. The remaining file size
            includes geometry, JSON, padding, and animations. Removed inputs
            show zero output bytes; newly packed images show zero original
            bytes. Imported packing inputs are excluded from original model
            size.
          </TooltipContent>
        </Tooltip>
      </p>
    </div>
  );
}
