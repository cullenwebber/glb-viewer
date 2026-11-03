import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { bytesLabel } from "@/lib/format";
import type { Comparison } from "@/model-types";
export function TextureSizeTable({
  comparisons,
}: {
  comparisons: Comparison[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Image</TableHead>
          <TableHead className="text-right">Original</TableHead>
          <TableHead className="text-right">Optimized</TableHead>
          <TableHead className="text-right">Difference</TableHead>
          <TableHead className="pl-8">Output</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...comparisons]
          .sort((a, b) => b.beforeBytes - a.beforeBytes)
          .map((row) => (
            <TableRow key={row.key}>
              <TableCell className="max-w-56 truncate text-xs" title={row.name}>
                {row.name}
              </TableCell>
              <TableCell
                className="text-right text-xs tabular-nums"
                title={`${row.beforeBytes} bytes`}
              >
                {bytesLabel(row.beforeBytes)}
              </TableCell>
              <TableCell
                className="text-right text-xs tabular-nums"
                title={`${row.afterBytes} bytes`}
              >
                {bytesLabel(row.afterBytes)}
              </TableCell>
              <TableCell
                className={`text-right text-xs tabular-nums ${row.afterBytes > row.beforeBytes ? "text-amber-400" : "text-foreground"}`}
              >
                {row.afterBytes <= row.beforeBytes ? "−" : "+"}
                {bytesLabel(Math.abs(row.beforeBytes - row.afterBytes))}
              </TableCell>
              <TableCell className="pl-8 text-[11px] text-muted-foreground">
                {row.after
                  ? `${row.after.width} × ${row.after.height}, ${row.after.mime.replace("image/", "")}`
                  : "Removed"}
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
