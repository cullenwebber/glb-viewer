import { Plus, Layers, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PackingRecipe } from "./PackingRecipe";
import type { WorkbenchState } from "@/hooks/use-workbench";
export function ChannelPacking({
  workbench: w,
}: {
  workbench: WorkbenchState;
}) {
  function add() {
    const material = w.analysis!.materials[0];
    w.changePacks([
      ...w.packs,
      {
        name: `Packed ORM ${w.packs.length + 1}`,
        material: material.id,
        target: "orm",
        size: 1024,
        format: "png",
        channels: [
          {
            texture: material.occlusion < 0 ? null : material.occlusion,
            channel: 0,
            value: 255,
          },
          {
            texture:
              material.metallicRoughness < 0
                ? null
                : material.metallicRoughness,
            channel: 1,
            value: 255,
          },
          {
            texture:
              material.metallicRoughness < 0
                ? null
                : material.metallicRoughness,
            channel: 2,
            value: 255,
          },
          { texture: null, channel: 3, value: 255 },
        ],
      },
    ]);
  }
  return (
    <div className="packing-layout">
      <div className="packing-heading">
        <div>
          <h2>Pack texture channels</h2>
          <p className="">
            Choose an image and source channel for each output channel. Inputs
            are resampled to the output size. Replaced source images are removed
            when no material uses them.
          </p>
        </div>
        <Button
          id="wb-add-pack"
          onClick={add}
          disabled={!w.analysis?.materials.length}
          className="shrink-0"
          size="sm"
        >
          <Plus />
          Add packing recipe
        </Button>
      </div>
      <Alert>
        <Info />
        <AlertDescription>
          ORM uses R = occlusion, G = roughness, B = metalness. Use linear data
          sources. Existing material factors, UVs, transforms, and samplers are
          preserved; incompatible ORM slots are rejected. Changing the target
          requires you to choose the appropriate channels.
        </AlertDescription>
      </Alert>
      <div id="wb-recipes" className="mt-6 space-y-5">
        {w.packs.map((pack, index) => (
          <PackingRecipe
            key={index}
            pack={pack}
            index={index}
            analysis={w.analysis!}
            onChange={(next) =>
              w.changePacks(
                w.packs.map((pack, i) => (i === index ? next : pack)),
              )
            }
            onRemove={() =>
              w.changePacks(w.packs.filter((_, i) => i !== index))
            }
          />
        ))}
        {!w.packs.length && (
          <div className="workspace-empty">
            <Layers className="size-8 opacity-60" />
            <p className="text-xs">
              Add a recipe to combine separate maps or repack existing channels.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
