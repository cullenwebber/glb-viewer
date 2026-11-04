import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CompressionControls } from "./CompressionControls";
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw } from "lucide-react";
import {
  textureSettingStatus,
  textureStatusLabels,
} from "@/lib/texture-settings";
import { bytesLabel } from "@/lib/format";
import type { TextureInfo, TextureSetting } from "@/model-types";
export function TextureOutputSettings({
  texture,
  setting,
  onChange,
  busy = false,
  packingUses = [],
}: {
  texture: TextureInfo;
  setting: TextureSetting;
  onChange: (update: Partial<TextureSetting>) => void;
  busy?: boolean;
  packingUses?: string[];
}) {
  const status = textureSettingStatus(texture, setting);
  const disabled =
    busy || !texture.editable || texture.inputOnly || setting.remove;
  return (
    <div className="texture-output-settings">
      <section>
        <h3 className="section-heading">Image</h3>
        <dl className="property-list">
          <div>
            <dt>Resolution</dt>
            <dd>
              {texture.width} × {texture.height}
            </dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>{texture.mime.replace("image/", "")}</dd>
          </div>
          <div>
            <dt>Encoded size</dt>
            <dd>{bytesLabel(texture.bytes)}</dd>
          </div>
          <div>
            <dt>Color space</dt>
            <dd>{texture.colorSpace}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          {texture.slots.join(", ") || "No material assignment"}
        </p>
        {texture.inputOnly && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Packing input. Use a recipe to add it to the model.
          </p>
        )}
        {texture.warning && (
          <Alert className="mt-3">
            <AlertDescription>{texture.warning}</AlertDescription>
          </Alert>
        )}
      </section>
      <section>
        <h3 className="section-heading">Output settings</h3>
        <p className={`texture-state is-${status} mb-3`}>
          {textureStatusLabels[status]}
        </p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wb-resize" className="text-xs">
              Maximum resolution
            </Label>
            <NativeSelect
              id="wb-resize"
              value={setting.maxSize}
              disabled={disabled}
              onChange={(event) =>
                onChange({ maxSize: Number(event.target.value) })
              }
              className="w-full text-xs"
            >
              {[0, 256, 512, 1024, 2048, 4096, 8192].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value ? `${value} px` : "Original resolution"}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wb-format" className="text-xs">
              Encoding
            </Label>
            <NativeSelect
              id="wb-format"
              value={setting.format}
              disabled={disabled}
              onChange={(event) =>
                onChange({ format: event.target.value, compression: {} })
              }
              className="w-full text-xs"
            >
              {[
                ["keep", "Original format"],
                ["png", "PNG · lossless"],
                ["jpeg", "JPEG"],
                ["webp", "WebP"],
                ["etc1s", "KTX2 · ETC1S"],
                ["uastc", "KTX2 · UASTC"],
              ].map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <CompressionControls
            format={setting.format}
            options={setting.compression}
            disabled={disabled}
            onChange={(compression) => onChange({ compression })}
          />
          <Button
            id="wb-reset-texture"
            size="sm"
            variant="outline"
            disabled={busy || status !== "configured"}
            onClick={() =>
              onChange({ maxSize: 0, format: "keep", compression: {} })
            }
          >
            <RotateCcw /> Reset output settings
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Changes apply to every material using this image. Aspect ratio is
            preserved.
          </p>
          {texture.mime === "image/ktx2" && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Reimport the source image to resize or repack an existing KTX2
              texture.
            </p>
          )}
        </div>
      </section>
      {!texture.inputOnly && (
        <section>
          <h3 className="section-heading">Remove texture</h3>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            {setting.remove
              ? "Marked for removal. Run optimization to remove this image from every material using it. Keep it to restore your previous settings."
              : "Remove this image and all its material assignments from the optimized model. Material factors remain unchanged. The original model and image files are never modified."}
          </p>
          {packingUses.length > 0 && !setting.remove && (
            <p className="mb-3 text-[11px] text-muted-foreground">
              Used by {packingUses.join(", ")}. Remove it from those packing
              recipes first.
            </p>
          )}
          <Button
            id="wb-remove-texture"
            size="sm"
            variant={setting.remove ? "outline" : "destructive"}
            disabled={busy || (!setting.remove && packingUses.length > 0)}
            onClick={() => onChange({ remove: !setting.remove })}
          >
            {setting.remove ? <RotateCcw /> : <Trash2 />}
            {setting.remove
              ? "Keep this texture"
              : "Remove from optimized model"}
          </Button>
        </section>
      )}
      <section>
        <h3 className="section-heading">Usage</h3>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {texture.uses.join(", ") || "Unassigned"}
        </p>
        {texture.infos.map((info, index) => (
          <p key={index} className="mt-2 text-[11px] text-muted-foreground">
            UV{info.uv} · wrap {info.wrapS}/{info.wrapT}
          </p>
        ))}
      </section>
    </div>
  );
}
