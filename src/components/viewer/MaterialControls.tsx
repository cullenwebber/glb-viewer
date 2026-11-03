import { useState } from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UVInspector } from "./UVInspector";
import type { ViewerController } from "@/hooks/use-model-viewer";
export const inspectionModes = {
  material: "Material",
  baseColor: "Base color",
  roughness: "Roughness",
  metalness: "Metalness",
  normalMap: "Normal map",
  normals: "Normal directions",
  ao: "Ambient occlusion",
  alpha: "Alpha",
  checker: "UV checker",
  orientation: "Face orientation",
  weights: "Bone weights",
  cost: "Cost heatmap",
};
export function MaterialControls({ viewer: v }: { viewer: ViewerController }) {
  const [uv, setUV] = useState(false);
  return (
    <section>
      <h3 className="section-heading">Surface inspection</h3>
      <div className="control-property">
        <Label htmlFor="surface-mode">View</Label>
        <NativeSelect
          id="surface-mode"
          value={v.display.inspection}
          onChange={(e) =>
            v.updateDisplay({
              inspection: e.target.value as typeof v.display.inspection,
              ...(e.target.value === "weights" ? { bones: true } : {}),
            })
          }
        >
          {Object.entries(inspectionModes).map(([key, label]) => (
            <NativeSelectOption key={key} value={key}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="control-property">
        <Label htmlFor="uv-set">UV set</Label>
        <NativeSelect
          id="uv-set"
          value={v.display.uvSet}
          onChange={(e) => v.updateDisplay({ uvSet: Number(e.target.value) })}
        >
          {[0, 1, 2, 3].map((i) => (
            <NativeSelectOption key={i} value={i}>
              UV{i}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {v.display.inspection === "cost" && (
        <>
          <NativeSelect
            aria-label="Heatmap cost"
            value={v.display.costMetric}
            onChange={(e) =>
              v.updateDisplay({
                costMetric: e.target.value as typeof v.display.costMetric,
              })
            }
          >
            <NativeSelectOption value="triangles">Triangles</NativeSelectOption>
            <NativeSelectOption value="materials">
              Material slots
            </NativeSelectOption>
            <NativeSelectOption value="textures">
              Texture memory
            </NativeSelectOption>
          </NativeSelect>
          <p className="inspection-note">
            Blue is lower cost; red is the highest cost in this model. Shared
            textures count toward each mesh that uses them.
          </p>
        </>
      )}
      {v.display.inspection === "weights" && (
        <>
          <NativeSelect
            aria-label="Weight bone"
            value={v.display.weightBone}
            onChange={(e) =>
              v.updateDisplay({ weightBone: e.target.value, bones: true })
            }
          >
            <NativeSelectOption value="">Choose a bone</NativeSelectOption>
            {v.state.nodes
              .filter((n) => n.bone)
              .map((n) => (
                <NativeSelectOption key={n.id} value={n.id}>
                  {n.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
          <p className="inspection-note">
            Click a joint in the viewport or choose a bone. Blue is zero
            influence; red is full influence. Enable Bones to see joints.
          </p>
        </>
      )}
      {v.display.inspection === "checker" && (
        <p className="inspection-note">
          Meshes missing this UV set appear red.
        </p>
      )}
      {v.display.inspection === "orientation" && (
        <p className="inspection-note">
          Blue faces point toward the camera; red faces point away. Check red
          exterior faces for reversed winding.
        </p>
      )}
      {v.display.inspection === "normals" && (
        <p className="inspection-note">
          Shows geometry normal directions, excluding normal-map detail.
        </p>
      )}
      <Button
        id="open-uv"
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        onClick={() => setUV(true)}
      >
        Inspect UV layout
      </Button>
      <UVInspector viewer={v} open={uv} onOpenChange={setUV} />
    </section>
  );
}
