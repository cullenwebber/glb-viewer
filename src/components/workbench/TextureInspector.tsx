import { ImageIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TextureDebugger } from "./TextureDebugger";
import { TextureList } from "./TextureList";
import { TextureOutputSettings } from "./TextureOutputSettings";
import type { WorkbenchState } from "@/hooks/use-workbench";
export function TextureInspector({
  workbench: w,
}: {
  workbench: WorkbenchState;
}) {
  const row = w.analysis?.textures.find((texture) => texture.id === w.selected),
    setting = w.settings.find((setting) => setting.id === w.selected),
    comparison = w.report?.comparisons.find(
      (item) => item.key === `t${w.selected}`,
    );
  return (
    <div className="texture-inspector-layout">
      <TextureList
        textures={w.analysis?.textures ?? []}
        selected={w.selected}
        onSelect={w.setSelected}
        onImport={w.importTextures}
      />
      <div className="texture-preview-panel">
        {row && setting ? (
          <>
            <div className="texture-preview-heading">
              <h2>{row.name}</h2>
              <span>
                {row.width} × {row.height}
              </span>
            </div>
            <TextureDebugger
              key={row.id}
              token={w.token}
              texture={row}
              outputId={comparison?.outputId}
              notify={w.notify}
            />
          </>
        ) : (
          <div className="workspace-empty">
            <ImageIcon className="size-6" />
            <p>Select an image to inspect it.</p>
          </div>
        )}
      </div>
      <ScrollArea className="texture-settings-panel">
        <div className="panel-heading">
          <h2>Properties</h2>
        </div>
        {row && setting && (
          <TextureOutputSettings
            texture={row}
            setting={setting}
            onChange={(update) => w.changeTexture(row.id, update)}
          />
        )}
      </ScrollArea>
    </div>
  );
}
