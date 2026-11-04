import {
  ImagePlus,
  ImageIcon,
  Search,
  CircleCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { bytesLabel } from "@/lib/format";
import type { TextureInfo, TextureSetting } from "@/model-types";
import {
  textureSettingStatus,
  textureStatusLabels,
} from "@/lib/texture-settings";
export function TextureList({
  textures,
  settings,
  selected,
  onSelect,
  onImport,
}: {
  textures: TextureInfo[];
  settings: TextureSetting[];
  selected: number;
  onSelect: (id: number) => void;
  onImport: () => void;
}) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("size"),
    [filter, setFilter] = useState("all");
  const settingsById = new Map(
    settings.map((setting) => [setting.id, setting]),
  );
  const status = (texture: TextureInfo) =>
    textureSettingStatus(texture, settingsById.get(texture.id));
  const modelTextures = textures.filter((texture) => !texture.inputOnly);
  const configured = modelTextures.filter(
    (texture) => status(texture) === "configured",
  ).length;
  const removed = textures.filter(
    (texture) => status(texture) === "removed",
  ).length;
  const rows = [...textures]
    .filter(
      (texture) =>
        texture.name.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "all" || status(texture) === filter),
    )
    .sort((a, b) =>
      sort === "size" ? b.bytes - a.bytes : a.name.localeCompare(b.name),
    );
  return (
    <div className="texture-library">
      <div className="panel-heading">
        <h2>Images</h2>
        <Button
          id="wb-import"
          variant="ghost"
          size="icon-sm"
          title="Import images for channel packing"
          aria-label="Import texture files"
          onClick={onImport}
        >
          <ImagePlus />
        </Button>
      </div>
      <div className="scene-search">
        <Search className="size-3.5" />
        <Input
          aria-label="Filter textures"
          placeholder="Filter images…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="texture-sort">
        <span>{rows.length} images</span>
        <NativeSelect
          id="wb-sort"
          aria-label="Sort textures"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="w-28 text-[11px]"
        >
          <NativeSelectOption value="size">Largest first</NativeSelectOption>
          <NativeSelectOption value="name">Name</NativeSelectOption>
        </NativeSelect>
      </div>
      <div
        className="texture-status-summary"
        role="status"
        aria-label="Texture configuration progress"
      >
        {configured} / {modelTextures.length} configured
        {removed ? ` · ${removed} to remove` : ""}
      </div>
      <div className="texture-status-filter">
        <NativeSelect
          aria-label="Filter textures by status"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="w-full text-[11px]"
        >
          <NativeSelectOption value="all">All images</NativeSelectOption>
          <NativeSelectOption value="unchanged">Unchanged</NativeSelectOption>
          <NativeSelectOption value="configured">Configured</NativeSelectOption>
          <NativeSelectOption value="removed">
            Marked for removal
          </NativeSelectOption>
          <NativeSelectOption value="input">Packing inputs</NativeSelectOption>
        </NativeSelect>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div id="wb-texture-list" className="space-y-0.5 p-2">
          {rows.map((texture) => (
            <Button
              key={texture.id}
              variant={texture.id === selected ? "secondary" : "ghost"}
              data-texture={texture.id}
              data-texture-status={status(texture)}
              aria-label={`${texture.name} · ${textureStatusLabels[status(texture)]}`}
              className="texture-list-item"
              onClick={() => onSelect(texture.id)}
            >
              <div className="texture-thumb">
                {texture.thumbnail ? (
                  <img src={texture.thumbnail} alt="" />
                ) : (
                  <ImageIcon className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <strong>{texture.name}</strong>
                <span>
                  {texture.width} × {texture.height}
                </span>
              </div>
              <div className="texture-list-meta">
                <span className="texture-list-size">
                  {bytesLabel(texture.bytes)}
                </span>
                <span className={`texture-state is-${status(texture)}`}>
                  {status(texture) === "configured" && (
                    <CircleCheck size={11} />
                  )}
                  {status(texture) === "removed" && <Trash2 size={11} />}
                  {textureStatusLabels[status(texture)]}
                </span>
              </div>
            </Button>
          ))}
          {!rows.length && (
            <p className="p-4 text-xs text-muted-foreground">
              No matching images.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
