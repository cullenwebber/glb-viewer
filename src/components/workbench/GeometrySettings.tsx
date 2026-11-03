import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { NumberSetting } from "./CompressionControls";
import type { WorkbenchState } from "@/hooks/use-workbench";
export function GeometrySettings({
  workbench: w,
}: {
  workbench: WorkbenchState;
}) {
  const options = w.optimization;
  function meshChange(
    key: string,
    update: { protected?: boolean; ratio?: number },
  ) {
    const rows = options.meshes || [],
      old = rows.find((row) => row.key === key);
    w.changeOptimization({
      meshes: [
        ...rows.filter((row) => row.key !== key),
        { ...old, key, ...update },
      ],
    });
  }
  return (
    <div className="utility-page">
      <div className="utility-heading">
        <div>
          <h2>Geometry and cleanup</h2>
          <p>
            Reduce rendering cost independently of file compression. Compare the
            result before export.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-section">
          <h3>Simplification</h3>
          <div className="grid grid-cols-2 gap-4">
            <NumberSetting
              label="Keep triangles (%)"
              value={(options.ratio ?? 1) * 100}
              min={1}
              max={100}
              onChange={(value) => w.changeOptimization({ ratio: value / 100 })}
            />
            <NumberSetting
              label="Maximum error (%)"
              value={(options.error ?? 0.001) * 100}
              min={0.0001}
              max={100}
              step={0.01}
              onChange={(value) => w.changeOptimization({ error: value / 100 })}
            />
          </div>
          <div className="control-property mt-4">
            <Label htmlFor="lock-borders">Lock mesh borders</Label>
            <Switch
              id="lock-borders"
              checked={options.lockBorder ?? true}
              onCheckedChange={(lockBorder) =>
                w.changeOptimization({ lockBorder })
              }
            />
          </div>
          <p>
            Targets are approximate and constrained by the error limit. Skinned
            and morph-target meshes are excluded from simplification.
          </p>
        </section>
        <section className="settings-section">
          <h3>LOD exports</h3>
          <Label htmlFor="lod-levels" className="mb-2 text-xs">
            Additional detail levels
          </Label>
          <NativeSelect
            id="lod-levels"
            value={(options.lods || []).join(",")}
            onChange={(event) =>
              w.changeOptimization({
                lods: event.target.value
                  ? event.target.value.split(",").map(Number)
                  : [],
              })
            }
            className="w-full"
          >
            <NativeSelectOption value="">No additional LODs</NativeSelectOption>
            <NativeSelectOption value="0.5">
              50% of base target
            </NativeSelectOption>
            <NativeSelectOption value="0.5,0.25">
              50% and 25% of base target
            </NativeSelectOption>
            <NativeSelectOption value="0.75,0.5,0.25">
              75%, 50%, and 25% of base target
            </NativeSelectOption>
          </NativeSelect>
          <p>
            LOD files are included in the Three.js export bundle. Choose
            switching distances in your application. Protected meshes retain
            their geometry.
          </p>
        </section>
        <section className="settings-section">
          <h3>Resource cleanup</h3>
          {(
            [
              {
                key: "dedup",
                label: "Deduplicate geometry, materials, and textures",
              },
              { key: "prune", label: "Remove unused resources" },
              {
                key: "cleanAttributes",
                label: "Remove unused vertex attributes",
              },
              { key: "resample", label: "Clean animation keyframes" },
            ] as const
          ).map(({ key, label }) => (
            <div key={key} className="control-property">
              <Label htmlFor={"opt-" + key}>{label}</Label>
              <Switch
                id={"opt-" + key}
                checked={options[key] ?? false}
                onCheckedChange={(value) =>
                  w.changeOptimization({ [key]: value })
                }
              />
            </div>
          ))}
          <p>
            Animation cleanup removes redundant keyframes. Review materials and
            animation after removing unused attributes.
          </p>
        </section>
        <section className="settings-section">
          <h3>Draw-call reduction</h3>
          {(
            [
              { key: "merge", label: "Join compatible meshes" },
              { key: "instance", label: "Instance repeated meshes" },
            ] as const
          ).map(({ key, label }) => (
            <div key={key} className="control-property">
              <Label htmlFor={"opt-" + key}>{label}</Label>
              <Switch
                id={"opt-" + key}
                checked={options[key] ?? false}
                onCheckedChange={(value) =>
                  w.changeOptimization({ [key]: value })
                }
              />
            </div>
          ))}
          <div className="control-property">
            <Label htmlFor="preserve-named">Preserve named objects</Label>
            <Switch
              id="preserve-named"
              checked={options.preserveNamed ?? true}
              onCheckedChange={(preserveNamed) =>
                w.changeOptimization({ preserveNamed })
              }
            />
          </div>
          <p>
            Enable deduplication before instancing independent duplicates.
            Instancing is skipped on animated models. Preserving names prevents
            structural merging and instancing of named objects.
          </p>
        </section>
      </div>
      <div className="utility-heading mt-8">
        <div>
          <h2>Per-mesh overrides</h2>
          <p>
            Protect meshes used by application code, or give an individual mesh
            a different triangle target.
          </p>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mesh</TableHead>
            <TableHead>Triangles</TableHead>
            <TableHead>Keep (%)</TableHead>
            <TableHead>Protect</TableHead>
            <TableHead>Constraints</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {w.analysis?.meshes.map((mesh) => {
            const override = options.meshes?.find(
              (row) => row.key === mesh.key,
            );
            return (
              <TableRow key={mesh.id}>
                <TableCell className="text-xs">{mesh.name}</TableCell>
                <TableCell className="text-xs tabular-nums">
                  {mesh.triangles.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={`Triangle target for ${mesh.name}`}
                    type="number"
                    min={1}
                    max={100}
                    disabled={
                      override?.protected || mesh.skinned || mesh.morphTargets
                    }
                    value={(override?.ratio ?? options.ratio ?? 1) * 100}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (value >= 1 && value <= 100)
                        meshChange(mesh.key, { ratio: value / 100 });
                    }}
                    className="w-20 text-xs"
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    aria-label={`Protect ${mesh.name}`}
                    checked={override?.protected ?? false}
                    onCheckedChange={(value) =>
                      meshChange(mesh.key, { protected: value })
                    }
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {mesh.skinned
                    ? "Skinned"
                    : mesh.morphTargets
                      ? "Morph targets"
                      : "Static"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
