import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { DisplaySettings } from "@/viewer/types";
export function InspectionControls({
  display,
  onChange,
}: {
  display: DisplaySettings;
  onChange: (update: Partial<DisplaySettings>) => void;
}) {
  return (
    <section>
      <h3 className="section-heading">Geometry inspection</h3>
      <div className="control-property">
        <Label htmlFor="normal-overlay">Normals</Label>
        <NativeSelect
          id="normal-overlay"
          aria-label="Normal overlay"
          value={display.normals}
          onChange={(event) =>
            onChange({
              normals: event.target.value as DisplaySettings["normals"],
            })
          }
        >
          <NativeSelectOption value="off">Off</NativeSelectOption>
          <NativeSelectOption value="vertex">Vertex normals</NativeSelectOption>
          <NativeSelectOption value="face">Face normals</NativeSelectOption>
        </NativeSelect>
      </div>
      {display.normals !== "off" && (
        <>
          <div className="control-property">
            <Label htmlFor="normal-length">Length (% of model)</Label>
            <Input
              id="normal-length"
              aria-label="Normal length"
              type="number"
              className="w-20"
              min="0.1"
              max="20"
              step="0.1"
              value={display.normalLength}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value >= 0.1 && value <= 20)
                  onChange({ normalLength: value });
              }}
            />
          </div>
          <div className="control-property">
            <Label htmlFor="normals-selected">Selected object only</Label>
            <Switch
              id="normals-selected"
              checked={display.normalsSelectedOnly}
              onCheckedChange={(value) =>
                onChange({ normalsSelectedOnly: value })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Vertex normals are blue; face normals are amber. Dense models show
            up to 5,000 sampled normals. Select an object to narrow the overlay.
          </p>
        </>
      )}
      <div className="control-property">
        <Label htmlFor="bone-overlay">Bones</Label>
        <Switch
          id="bone-overlay"
          checked={display.bones}
          onCheckedChange={(value) => onChange({ bones: value })}
        />
      </div>
      <div className="control-property">
        <Label htmlFor="overlay-in-front">Overlays in front</Label>
        <Switch
          id="overlay-in-front"
          checked={display.overlayInFront}
          onCheckedChange={(value) => onChange({ overlayInFront: value })}
        />
      </div>
      {display.bones && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Bone connections follow animation and timeline scrubbing. Models
          without a skeleton have no bone overlay.
        </p>
      )}
    </section>
  );
}
