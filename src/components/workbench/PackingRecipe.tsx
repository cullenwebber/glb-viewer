import { CompressionControls } from "./CompressionControls";
import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { Analysis, Pack } from "@/model-types";
export function PackingRecipe({
  pack,
  index,
  analysis,
  onChange,
  onRemove,
}: {
  pack: Pack;
  index: number;
  analysis: Analysis;
  onChange: (pack: Pack) => void;
  onRemove: () => void;
}) {
  return (
    <Card data-pack={index}>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <Input
          data-field="name"
          aria-label="Packed texture name"
          value={pack.name}
          onChange={(event) => onChange({ ...pack, name: event.target.value })}
          className="max-w-72"
        />
        <Button
          variant="ghost"
          size="sm"
          data-remove-pack={index}
          onClick={onRemove}
        >
          <Trash2 />
          Remove
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor={`pack-${index}-material`}>Material</Label>
            <NativeSelect
              id={`pack-${index}-material`}
              data-field="material"
              value={pack.material}
              onChange={(event) =>
                onChange({ ...pack, material: Number(event.target.value) })
              }
              className="w-full text-xs"
            >
              {analysis.materials.map((material) => (
                <NativeSelectOption key={material.id} value={material.id}>
                  {material.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`pack-${index}-target`}>
              Bind packed result to
            </Label>
            <NativeSelect
              id={`pack-${index}-target`}
              data-field="target"
              value={pack.target}
              onChange={(event) =>
                onChange({ ...pack, target: event.target.value })
              }
              className="w-full text-xs"
            >
              {[
                ["orm", "Occlusion + roughness + metalness"],
                ["baseColor", "Base color + alpha"],
                ["emissive", "Emissive"],
                ["normal", "Normal"],
              ].map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`pack-${index}-size`}>Output size</Label>
            <NativeSelect
              id={`pack-${index}-size`}
              data-field="size"
              value={pack.size}
              onChange={(event) =>
                onChange({ ...pack, size: Number(event.target.value) })
              }
              className="w-full text-xs"
            >
              {[256, 512, 1024, 2048, 4096].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value} × {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`pack-${index}-format`}>Encoding</Label>
            <NativeSelect
              id={`pack-${index}-format`}
              data-field="format"
              value={pack.format}
              onChange={(event) =>
                onChange({
                  ...pack,
                  format: event.target.value,
                  compression: {},
                })
              }
              className="w-full text-xs"
            >
              {[
                ["png", "PNG"],
                ["etc1s", "KTX2 · ETC1S"],
                ["uastc", "KTX2 · UASTC"],
              ].map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {pack.channels.map((source, channel) => (
            <div
              className="space-y-3 rounded-lg border bg-muted/30 p-3"
              key={channel}
            >
              <Label
                className={`font-mono text-base ${["text-red-300", "text-green-300", "text-blue-300", "text-foreground"][channel]}`}
                htmlFor={`pack-${index}-source-${channel}`}
              >
                {["R", "G", "B", "A"][channel]}
              </Label>
              <NativeSelect
                id={`pack-${index}-source-${channel}`}
                aria-label={`${["Red", "Green", "Blue", "Alpha"][channel]} source`}
                data-source={channel}
                value={source.texture ?? "constant"}
                onChange={(event) =>
                  onChange({
                    ...pack,
                    channels: pack.channels.map((selection, i) =>
                      i === channel
                        ? {
                            ...selection,
                            texture:
                              event.target.value === "constant"
                                ? null
                                : Number(event.target.value),
                          }
                        : selection,
                    ),
                  })
                }
                className="w-full text-xs"
              >
                <NativeSelectOption value="constant">
                  Constant
                </NativeSelectOption>
                {analysis.textures
                  .filter((texture) => texture.editable)
                  .map((texture) => (
                    <NativeSelectOption key={texture.id} value={texture.id}>
                      {texture.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
              {source.texture === null ? (
                <Input
                  aria-label={`Constant ${channel}`}
                  data-constant={channel}
                  type="number"
                  min={0}
                  max={255}
                  value={source.value}
                  onChange={(event) =>
                    onChange({
                      ...pack,
                      channels: pack.channels.map((selection, i) =>
                        i === channel
                          ? { ...selection, value: Number(event.target.value) }
                          : selection,
                      ),
                    })
                  }
                />
              ) : (
                <NativeSelect
                  aria-label={`Input channel ${channel}`}
                  data-input-channel={channel}
                  value={source.channel}
                  onChange={(event) =>
                    onChange({
                      ...pack,
                      channels: pack.channels.map((selection, i) =>
                        i === channel
                          ? {
                              ...selection,
                              channel: Number(event.target.value),
                            }
                          : selection,
                      ),
                    })
                  }
                  className="w-full text-xs"
                >
                  {["R", "G", "B", "A"].map((value, index) => (
                    <NativeSelectOption key={value} value={index}>
                      {value}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </div>
          ))}
        </div>
        <CompressionControls
          format={pack.format}
          options={pack.compression}
          onChange={(compression) => onChange({ ...pack, compression })}
        />
      </CardContent>
    </Card>
  );
}
