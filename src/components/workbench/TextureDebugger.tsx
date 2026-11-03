import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TextureCanvas } from "./TextureCanvas";
import { decodePreview } from "@/texture-preview";
import { download, errorMessage } from "@/lib/format";
import type { TextureInfo } from "@/model-types";
export function TextureDebugger({
  token,
  texture,
  outputId,
  notify,
}: {
  token: string;
  texture: TextureInfo;
  outputId: number | null | undefined;
  notify: (message: string, error?: boolean) => void;
}) {
  const [output, setOutput] = useState(false),
    [channel, setChannel] = useState("RGBA"),
    [flip, setFlip] = useState(false),
    [decoded, setDecoded] = useState<HTMLCanvasElement>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setDecoded(undefined);
    window
      .desktop!.textureImage(token, output ? outputId! : texture.id, output)
      .then((data) => decodePreview(data.bytes, data.mime))
      .then((image) => {
        if (active) setDecoded(image);
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, texture.id, output, outputId]);
  async function save() {
    try {
      const data = await window.desktop!.textureImage(
        token,
        output ? outputId! : texture.id,
        output,
      );
      download(
        data.bytes,
        texture.name.replace(/\.[^.]+$/, "") +
          "." +
          data.mime.replace("image/", ""),
      );
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }
  return (
    <div className="texture-debugger">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          id="wb-channels"
          type="single"
          size="sm"
          variant="outline"
          value={channel}
          onValueChange={(value) => value && setChannel(value)}
        >
          {["RGBA", "RGB", "R", "G", "B", "A"].map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              data-channel={value}
              aria-label={`View ${value} channels`}
              className="px-2 font-mono text-[10px]"
            >
              {value}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center gap-3">
          <NativeSelect
            id="wb-version"
            aria-label="Texture version"
            value={output ? "output" : "source"}
            onChange={(event) => setOutput(event.target.value === "output")}
            className="h-8 text-xs"
          >
            <NativeSelectOption value="source">Source</NativeSelectOption>
            {outputId != null && (
              <NativeSelectOption value="output">Optimized</NativeSelectOption>
            )}
          </NativeSelect>
          <div className="flex items-center gap-2">
            <Switch id="wb-flip" checked={flip} onCheckedChange={setFlip} />
            <Label htmlFor="wb-flip" className="whitespace-nowrap text-[10px]">
              Flip Y
            </Label>
          </div>
        </div>
      </div>
      <TextureCanvas
        decoded={decoded}
        channel={channel}
        flip={flip}
        loading={loading}
        error={error}
      />
      <Button
        id="wb-save-texture"
        variant="outline"
        size="sm"
        onClick={save}
        className="texture-download"
      >
        <Download />
        Download displayed texture
      </Button>
    </div>
  );
}
