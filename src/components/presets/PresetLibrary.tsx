import { useEffect, useState } from "react";
import { Plus, Upload, Download, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import type { Preset, Recipe } from "@/model-types";
import type { WorkbenchState } from "@/hooks/use-workbench";
import { errorMessage } from "@/lib/format";
export function PresetLibrary({ workbench: w }: { workbench: WorkbenchState }) {
  const [presets, setPresets] = useState<Preset[]>([]),
    [editor, setEditor] = useState<{
      id?: string;
      name: string;
      recipe: Recipe;
    } | null>(null),
    [deleting, setDeleting] = useState<Preset | null>(null),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      setPresets(await window.desktop!.listPresets());
    } catch (error) {
      w.notify(errorMessage(error), true);
    }
  }
  useEffect(() => {
    if (window.desktop) void refresh();
  }, []);
  async function save() {
    if (!editor || !editor.name.trim()) return;
    setBusy(true);
    try {
      await window.desktop!.savePreset(editor);
      setEditor(null);
      await refresh();
      w.notify("Preset saved.");
    } catch (error) {
      w.notify(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="utility-page">
      <div className="utility-heading">
        <div>
          <h2>Preset library</h2>
          <p>
            Reusable texture roles, codec choices, geometry settings, and
            packing recipes. Stored on this Mac.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            id="import-preset"
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const preset = await window.desktop!.importPreset();
                if (preset) {
                  await refresh();
                  w.notify("Preset imported.");
                }
              } catch (error) {
                w.notify(errorMessage(error), true);
              }
            }}
          >
            <Upload />
            Import
          </Button>
          <Button
            id="save-current-preset"
            size="sm"
            disabled={!w.analysis || w.phase !== "idle"}
            onClick={() => {
              const recipe = w.getRecipe();
              if (recipe)
                setEditor({
                  name:
                    w.source?.name.replace(/\.(glb|gltf)$/i, "") || "My preset",
                  recipe,
                });
            }}
          >
            <Plus />
            Save current settings
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Geometry</TableHead>
            <TableHead>Texture rules</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {presets.map((preset) => (
            <TableRow key={preset.id} data-preset={preset.id}>
              <TableCell className="text-xs font-medium">
                {preset.name}
              </TableCell>
              <TableCell className="text-xs">
                {preset.recipe.geometry === "none"
                  ? "Uncompressed"
                  : preset.recipe.geometry}
              </TableCell>
              <TableCell className="text-xs">
                {preset.recipe.textureRules.length}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(preset.updatedAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!w.analysis || w.phase !== "idle"}
                    onClick={() => {
                      try {
                        w.applyPreset(preset.recipe);
                      } catch (error) {
                        w.notify(errorMessage(error), true);
                      }
                    }}
                  >
                    Apply
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Rename ${preset.name}`}
                    onClick={() =>
                      setEditor({
                        id: preset.id,
                        name: preset.name,
                        recipe: preset.recipe,
                      })
                    }
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Export ${preset.name}`}
                    onClick={async () => {
                      try {
                        await window.desktop!.exportPreset(preset);
                      } catch (error) {
                        w.notify(errorMessage(error), true);
                      }
                    }}
                  >
                    <Download />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${preset.name}`}
                    onClick={() => setDeleting(preset)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!presets.length && (
        <div className="workspace-empty">
          <h3 className="text-base text-foreground">No saved presets</h3>
          <p>
            Set up a model, then save its settings for your next Blender export.
          </p>
        </div>
      )}
      <div className="settings-section">
        <h3>How presets match assets</h3>
        <p>
          Images first match by identity, then by texture role when the settings
          are unambiguous. Packing recipes require a unique material name and
          matching source images. Missing or ambiguous mappings are skipped and
          reported. Per-model recipes restore automatically when the same source
          file is reopened or watched.
        </p>
      </div>
      <Dialog
        open={!!editor}
        onOpenChange={(value) => !value && setEditor(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor?.id ? "Rename preset" : "Save preset"}
            </DialogTitle>
            <DialogDescription>
              Saved settings can be applied to another model or exported as
              JSON.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Label htmlFor="preset-name">Name</Label>
            <Input
              id="preset-name"
              autoFocus
              maxLength={100}
              value={editor?.name || ""}
              onChange={(event) =>
                setEditor((previous) =>
                  previous
                    ? { ...previous, name: event.target.value }
                    : previous,
                )
              }
            />
            <Button type="submit" disabled={busy || !editor?.name.trim()}>
              {busy ? "Saving…" : "Save preset"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(value) => !value && setDeleting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              This removes the saved preset. Model files and current settings
              are unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await window.desktop!.deletePreset(deleting!.id);
                  setDeleting(null);
                  await refresh();
                } catch (error) {
                  w.notify(errorMessage(error), true);
                }
              }}
            >
              Delete preset
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
