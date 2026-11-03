import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { NumberSetting } from "./CompressionControls";
import type { GeometryCompression as Options } from "@/model-types";
export function GeometryCompression({
  geometry,
  options,
  onChange,
  disabled,
}: {
  geometry: string;
  options: Options;
  onChange: (options: Partial<Options>) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        id="geometry-settings"
        variant="outline"
        size="icon-sm"
        aria-label="Geometry compression settings"
        disabled={disabled || geometry === "none"}
        onClick={() => setOpen(true)}
      >
        <Settings2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {geometry === "draco" ? "Draco" : "Meshopt"} settings
            </DialogTitle>
            <DialogDescription>
              Choose precision and compression effort for this export.
            </DialogDescription>
          </DialogHeader>
          {geometry === "meshopt" ? (
            <div className="space-y-2">
              <Label htmlFor="meshopt-level">Compression level</Label>
              <NativeSelect
                id="meshopt-level"
                value={options.meshoptLevel ?? "medium"}
                onChange={(event) =>
                  onChange({
                    meshoptLevel: event.target.value as "medium" | "high",
                  })
                }
                className="w-full"
              >
                <NativeSelectOption value="medium">Medium</NativeSelectOption>
                <NativeSelectOption value="high">High</NativeSelectOption>
              </NativeSelect>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <NumberSetting
                label="Position precision (bits)"
                value={options.quantizePosition ?? 14}
                min={1}
                max={30}
                onChange={(quantizePosition) => onChange({ quantizePosition })}
              />
              <NumberSetting
                label="Normal precision (bits)"
                value={options.quantizeNormal ?? 10}
                min={1}
                max={30}
                onChange={(quantizeNormal) => onChange({ quantizeNormal })}
              />
              <NumberSetting
                label="UV precision (bits)"
                value={options.quantizeTexcoord ?? 12}
                min={1}
                max={30}
                onChange={(quantizeTexcoord) => onChange({ quantizeTexcoord })}
              />
              <NumberSetting
                label="Encode speed"
                value={options.encodeSpeed ?? 5}
                min={0}
                max={10}
                onChange={(encodeSpeed) => onChange({ encodeSpeed })}
              />
              <NumberSetting
                label="Decode speed"
                value={options.decodeSpeed ?? 5}
                min={0}
                max={10}
                onChange={(decodeSpeed) => onChange({ decodeSpeed })}
              />
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {geometry === "draco"
              ? "More precision bits preserve detail but increase size. Lower speed values favor compression over encode/decode speed."
              : "High compression can reduce size further, with more quantization and encoding work. Compare your optimized preview before exporting."}
          </p>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
