import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { DisplaySettings } from "@/viewer/types";
export function LightingControls({
  display,
  onChange,
}: {
  display: DisplaySettings;
  onChange: (update: Partial<DisplaySettings>) => void;
}) {
  return (
    <section>
      <h3 className="section-heading">Lighting</h3>
      <div className="control-property">
        <Label htmlFor="environment">Environment</Label>
        <NativeSelect
          id="environment"
          className="w-33 text-xs"
          value={display.environment}
          onChange={(event) =>
            onChange({
              environment: event.target.value as DisplaySettings["environment"],
            })
          }
        >
          <NativeSelectOption value="studio">Studio</NativeSelectOption>
          <NativeSelectOption value="neutral">Ambient</NativeSelectOption>
          <NativeSelectOption value="direct">Directional</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="control-property">
        <Label htmlFor="exposure">Exposure</Label>
        <div className="flex w-33 items-center gap-3">
          <Slider
            id="exposure"
            aria-label="Exposure"
            min={0.1}
            max={3}
            step={0.1}
            value={[display.exposure]}
            onValueChange={(value) => onChange({ exposure: value[0] })}
          />
          <output className="w-6 shrink-0 text-right text-[11px] tabular-nums">
            {display.exposure.toFixed(1)}
          </output>
        </div>
      </div>
    </section>
  );
}
