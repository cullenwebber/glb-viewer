import { useMemo, useState } from "react";
import { Search, Keyboard, X } from "lucide-react";
import { SceneTree } from "./SceneTree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ViewerState } from "@/viewer/types";
export function SceneSidebar({
  state,
  onHelp,
  onSelect,
  onClearSelection,
}: {
  state: ViewerState;
  onHelp: () => void;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
}) {
  const [query, setQuery] = useState("");
  const nodes = useMemo(
    () =>
      state.nodes.filter((node) =>
        node.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [state.nodes, query],
  );
  return (
    <aside className="scene-sidebar">
      <div className="panel-heading">
        <h2>Scene</h2>
        <span id="node-count">{state.nodeCount}</span>
      </div>
      <div className="scene-search">
        <Search className="size-3.5" />
        <Input
          aria-label="Filter scene objects"
          placeholder="Filter objects…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <SceneTree
          nodes={nodes}
          selectedId={state.selectedId}
          onSelect={onSelect}
        />
        {!nodes.length && (
          <p className="p-4 text-xs text-muted-foreground">
            No matching objects.
          </p>
        )}
      </ScrollArea>
      <div className="scene-footer">
        {state.selectedId && (
          <Button
            id="clear-selection"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={onClearSelection}
          >
            <X />
            Clear selection
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs text-muted-foreground"
          onClick={onHelp}
        >
          <Keyboard />
          Shortcuts
        </Button>
      </div>
    </aside>
  );
}
