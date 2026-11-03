import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DisplaySettings } from "@/viewer/types";
export function DisplayControls({
  display,
  onChange,
}: {
  display: DisplaySettings;
  onChange: (update: Partial<DisplaySettings>) => void;
}) {
  return (
    <section>
      <h3 className="section-heading">Display</h3>
      {(
        [
          { id: "grid", label: "Ground grid" },
          { id: "wireframe", label: "Wireframe" },
          { id: "rotate", label: "Auto rotate" },
        ] as const
      ).map(({ id, label }) => (
        <div className="control-property" key={id}>
          <Label htmlFor={id}>{label}</Label>
          <Switch
            id={id}
            checked={display[id]}
            onCheckedChange={(checked) => onChange({ [id]: checked })}
            aria-label={label}
          />
        </div>
      ))}
      <div className="control-property">
        <Label htmlFor="background">Background</Label>
        <div className="flex items-center gap-1.5">
          {["#0a0a0a", "#e7e8ea", "#000000"].map((color) => (
            <Button
              key={color}
              aria-label={`Background ${color}`}
              variant="outline"
              size="icon-sm"
              onClick={() => onChange({ background: color })}
              className={`size-5 rounded-sm p-0 ${display.background === color ? "ring-1 ring-foreground/60 ring-offset-2 ring-offset-background" : ""}`}
              style={{ backgroundColor: color }}
            />
          ))}
          <Input
            id="background"
            aria-label="Custom background"
            type="color"
            value={display.background}
            onChange={(event) => onChange({ background: event.target.value })}
            className="size-5 cursor-pointer rounded-sm p-0.5"
          />
        </div>
      </div>
    </section>
  );
}
