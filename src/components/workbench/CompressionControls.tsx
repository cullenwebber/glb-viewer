import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { TextureCompression } from "@/model-types";
function NumberSetting({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          if (event.target.value === "") return;
          const number = Number(event.target.value);
          if (Number.isFinite(number))
            onChange(Math.max(min, Math.min(max, number)));
        }}
        className="text-xs"
      />
    </div>
  );
}
export function CompressionControls({
  format,
  options = {},
  onChange,
  disabled = false,
}: {
  format: string;
  options?: TextureCompression;
  onChange: (options: TextureCompression) => void;
  disabled?: boolean;
}) {
  const id = useId();
  if (format === "keep")
    return (
      <p className="text-[10px] text-muted-foreground">
        Choose an output encoding to configure compression.
      </p>
    );
  const update = (value: Partial<TextureCompression>) =>
    onChange({ ...options, ...value });
  const ktx = format === "etc1s" || format === "uastc";
  return (
    <fieldset
      disabled={disabled}
      className="compression-settings space-y-4 disabled:opacity-50"
    >
      <legend className="mb-3 text-xs text-foreground">
        Compression settings
      </legend>
      <div className="grid grid-cols-2 gap-4">
        {format === "png" && (
          <NumberSetting
            label="PNG compression level"
            value={options.pngLevel ?? 9}
            min={0}
            max={9}
            onChange={(pngLevel) => update({ pngLevel })}
          />
        )}{" "}
        {["jpeg", "webp", "etc1s"].includes(format) && (
          <NumberSetting
            label={format === "etc1s" ? "ETC1S quality" : "Image quality"}
            value={options.quality ?? (format === "etc1s" ? 200 : 90)}
            min={1}
            max={format === "etc1s" ? 255 : 100}
            onChange={(quality) => update({ quality })}
          />
        )}{" "}
        {["webp", "etc1s"].includes(format) && (
          <NumberSetting
            label="Encoder effort"
            value={options.effort ?? (format === "etc1s" ? 2 : 4)}
            min={0}
            max={6}
            onChange={(effort) => update({ effort })}
          />
        )}{" "}
        {format === "uastc" && (
          <>
            <NumberSetting
              label="UASTC effort"
              value={options.uastcLevel ?? 2}
              min={0}
              max={3}
              onChange={(uastcLevel) => update({ uastcLevel })}
            />
            {options.rdo && (
              <NumberSetting
                label="RDO strength"
                value={options.rdoLambda ?? 1}
                min={0.01}
                max={10}
                step={0.1}
                onChange={(rdoLambda) => update({ rdoLambda })}
              />
            )}
          </>
        )}
      </div>
      {format === "webp" && (
        <div className="flex items-center justify-between">
          <Label htmlFor={`${id}-lossless`} className="text-xs">
            Lossless WebP
          </Label>
          <Switch
            id={`${id}-lossless`}
            aria-label="Lossless WebP"
            checked={options.lossless ?? false}
            onCheckedChange={(lossless) => update({ lossless })}
          />
        </div>
      )}
      {format === "uastc" && (
        <div className="flex items-center justify-between">
          <Label htmlFor={`${id}-rdo`} className="text-xs">
            Rate-distortion optimization
          </Label>
          <Switch
            id={`${id}-rdo`}
            aria-label="Rate-distortion optimization"
            checked={options.rdo ?? false}
            onCheckedChange={(rdo) => update({ rdo })}
          />
        </div>
      )}
      {ktx && (
        <div className="flex items-center justify-between">
          <Label htmlFor={`${id}-mipmaps`} className="text-xs">
            Generate mipmaps
          </Label>
          <Switch
            id={`${id}-mipmaps`}
            aria-label="Generate mipmaps"
            checked={options.mipmaps ?? true}
            onCheckedChange={(mipmaps) => update({ mipmaps })}
          />
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {format === "png"
          ? "PNG is lossless. Higher levels take longer and may reduce file size."
          : format === "uastc"
            ? "Higher effort takes longer. Higher RDO strength favors smaller files with more distortion."
            : format === "etc1s"
              ? "Higher quality preserves more detail. Higher effort takes longer and may improve compression."
              : "Higher quality favors detail. Lossless WebP ignores the quality setting."}
        {ktx && " Mipmaps improve minification at the cost of extra data."}
      </p>
    </fieldset>
  );
}
export { NumberSetting };
