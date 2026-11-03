import { ImagePlus, ImageIcon, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { bytesLabel } from "@/lib/format";
import type { TextureInfo } from "@/model-types";
export function TextureList({
  textures,
  selected,
  onSelect,
  onImport,
}: {
  textures: TextureInfo[];
  selected: number;
  onSelect: (id: number) => void;
  onImport: () => void;
}) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("size");
  const rows = [...textures]
    .filter((texture) =>
      texture.name.toLowerCase().includes(query.toLowerCase()),
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
      <ScrollArea className="min-h-0 flex-1">
        <div id="wb-texture-list" className="space-y-0.5 p-2">
          {rows.map((texture) => (
            <Button
              key={texture.id}
              variant={texture.id === selected ? "secondary" : "ghost"}
              data-texture={texture.id}
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
              <span className="texture-list-size">
                {bytesLabel(texture.bytes)}
              </span>
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
