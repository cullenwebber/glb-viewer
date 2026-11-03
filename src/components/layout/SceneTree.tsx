import { memo } from "react";
import { Box, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SceneNode } from "@/viewer/types";
export const SceneTree = memo(function SceneTree({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: SceneNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div id="tree" className="space-y-1 pr-2">
      {nodes.map((node) => (
        <Button
          key={node.id}
          title={node.name}
          variant={selectedId === node.id ? "secondary" : "ghost"}
          data-node-id={node.id}
          aria-pressed={selectedId === node.id}
          onClick={() => onSelect(node.id)}
          className="h-auto w-full justify-start gap-2 py-2 text-left text-xs"
          style={{ paddingLeft: 12 + Math.min(node.depth, 8) * 12 }}
        >
          {node.mesh ? (
            <Box className="size-3.5 shrink-0 text-primary/70" />
          ) : (
            <Layers className="size-3.5 shrink-0 text-primary/70" />
          )}
          <span className="truncate">{node.name}</span>
        </Button>
      ))}
    </div>
  );
});
