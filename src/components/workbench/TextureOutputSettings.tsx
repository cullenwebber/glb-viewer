import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CompressionControls } from "./CompressionControls";
import { bytesLabel } from "@/lib/format";
import type { TextureInfo, TextureSetting } from "@/model-types";
export function TextureOutputSettings({
  texture,
  setting,
  onChange,
}: {
  texture: TextureInfo;
  setting: TextureSetting;
  onChange: (update: Partial<TextureSetting>) => void;
}) {
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
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wb-resize" className="text-xs">
              Maximum resolution
            </Label>
            <NativeSelect
              id="wb-resize"
              value={setting.maxSize}
              disabled={!texture.editable || texture.inputOnly}
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
              disabled={!texture.editable || texture.inputOnly}
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
            disabled={!texture.editable || texture.inputOnly}
            onChange={(compression) => onChange({ compression })}
          />
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
