import type { BridgeMaterialReport } from "../../../electron/pipeline/material-runtime.mjs";

export function BlenderMaterialGraph({
  report,
}: {
  report: BridgeMaterialReport;
}) {
  const nodes = report.nodes;
  if (!nodes.length) return null;
  const minimumX = Math.min(...nodes.map((node) => node.position[0]));
  const maximumY = Math.max(...nodes.map((node) => node.position[1]));
  const positions = new Map(
    nodes.map((node) => [
      node.id,
      {
        x: node.position[0] - minimumX + 20,
        y: maximumY - node.position[1] + 20,
      },
    ]),
  );
  const width =
    Math.max(...[...positions.values()].map((point) => point.x)) + 200;
  const height =
    Math.max(...[...positions.values()].map((point) => point.y)) + 100;
  return (
    <div className="overflow-auto border border-border rounded mt-3 max-h-80">
      <svg
        role="img"
        aria-label={`${report.name} Blender material graph`}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          minWidth: Math.min(width, 1800),
          width: "100%",
          minHeight: 160,
        }}
      >
        {nodes.flatMap((node) =>
          node.inputs.map((input) => {
            const source = positions.get(input.source),
              target = positions.get(node.id)!;
            if (!source) return null;
            return (
              <path
                key={`${node.id}-${input.name}`}
                d={`M ${source.x + 170} ${source.y + 30} C ${source.x + 210} ${source.y + 30}, ${target.x - 40} ${target.y + 30}, ${target.x} ${target.y + 30}`}
                fill="none"
                stroke="var(--muted-foreground)"
                strokeWidth="2"
              >
                <title>
                  {input.socket} → {input.name}
                </title>
              </path>
            );
          }),
        )}
        {nodes.map((node) => {
          const point = positions.get(node.id)!;
          return (
            <g key={node.id} transform={`translate(${point.x},${point.y})`}>
              <title>
                {node.label} · {node.type}
              </title>
              <rect
                width="170"
                height="60"
                rx="8"
                fill="var(--card)"
                stroke={node.connected ? "var(--primary)" : "var(--border)"}
              />
              <text x="10" y="23" fill="var(--foreground)" fontSize="12">
                {node.label.slice(0, 22)}
              </text>
              <text x="10" y="43" fill="var(--muted-foreground)" fontSize="11">
                {node.type}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
