import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { bytesLabel } from "@/lib/format";
export function SizeComparisonChart({
  before,
  after,
}: {
  before: number;
  after: number;
}) {
  return (
    <ChartContainer
      className="h-40 w-full"
      config={{ bytes: { label: "File size", color: "var(--foreground)" } }}
    >
      <BarChart
        accessibilityLayer
        data={[
          { name: "Original", bytes: before },
          { name: "Optimized", bytes: after },
        ]}
        layout="vertical"
        margin={{ left: 0, right: 12 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <YAxis
          dataKey="name"
          type="category"
          tickLine={false}
          axisLine={false}
          width={70}
          tick={{ fontSize: 11 }}
        />
        <XAxis
          type="number"
          tickFormatter={bytesLabel}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value) => bytesLabel(Number(value))}
            />
          }
        />
        <Bar isAnimationActive={false} dataKey="bytes" radius={2} barSize={18}>
          <Cell fill="#444444" />
          <Cell fill="#ededed" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
