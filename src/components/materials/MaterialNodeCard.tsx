import { useRef, useState, useEffect, type PointerEvent } from "react";
import { decodePreview } from "@/texture-preview";
import { Color } from "three";
import { X, Unplug } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  materialNodeTypes,
  materialInputs,
  materialOutputs,
  materialNodeCategory,
  materialSocketY,
  type MaterialNode,
} from "@/lib/material-editor";

export const NODE_WIDTH = 240;
function ImagePreview({
  node,
  loadThumbnail,
}: {
  node: MaterialNode;
  loadThumbnail?: (reference: string) => Promise<string>;
}) {
  const [preview, setPreview] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPreview("");
    setFailed(false);
    const load = async () => {
      if (node.sourceTexture && loadThumbnail)
        return loadThumbnail(node.sourceTexture);
      if (node.image?.startsWith("data:image/ktx2;")) {
        const bytes = new Uint8Array(
          await (await fetch(node.image)).arrayBuffer(),
        );
        return (await decodePreview(bytes, "image/ktx2")).toDataURL(
          "image/png",
        );
      }
      return node.image || "";
    };
    void load()
      .then((value) => {
        if (!cancelled) setPreview(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [node.image, node.sourceTexture, loadThumbnail]);
  if (!node.image && !node.sourceTexture) return null;
  return (
    <div className="material-texture-preview">
      {preview ? (
        <img
          src={preview}
          alt={`${node.imageName || node.label} texture preview`}
        />
      ) : (
        <span>{failed ? "Preview unavailable" : "Loading preview…"}</span>
      )}
      <strong title={node.imageName || node.label}>
        {node.imageName || node.label}
      </strong>
      <small>
        {node.imageSize?.join(" × ")}
        {node.sourceTexture
          ? ` · UV${node.uvChannel ?? 0} · Model texture`
          : " · Embedded image"}
      </small>
    </div>
  );
}
export function wirePath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const bend = Math.max(
    60,
    Math.min(
      280,
      Math.abs(endX - startX) * 0.5 + Math.abs(endY - startY) * 0.15,
    ),
  );
  return `M${startX},${startY} C${startX + bend},${startY} ${endX - bend},${endY} ${endX},${endY}`;
}
export const socketY = materialSocketY;

function ColorValue({
  value,
  label,
  onChange,
}: {
  value: number[];
  label: string;
  onChange: (value: number[]) => void;
}) {
  const color = new Color().setRGB(value[0] || 0, value[1] || 0, value[2] || 0);
  return (
    <input
      type="color"
      aria-label={label}
      value={"#" + color.getHexString()}
      onChange={(event) => onChange(new Color(event.target.value).toArray())}
    />
  );
}

export function MaterialNodeCard({
  node,
  placing = false,
  selected,
  activeOutput,
  pending,
  snappedInput,
  onSelect,
  onDrag,
  onChange,
  onScrubStart,
  onScrubCancel,
  onOutput,
  onInput,
  onRewire,
  onDisconnect,
  onDelete,
  onActivate,
  onImage,
  loadThumbnail,
}: {
  node: MaterialNode;
  placing?: boolean;
  selected: boolean;
  activeOutput: boolean;
  pending: "shader" | "value" | null;
  snappedInput: string | null;
  onSelect: () => void;
  onDrag: (event: PointerEvent) => void;
  onChange: (node: MaterialNode, checkpoint?: boolean) => void;
  onScrubStart: () => void;
  onScrubCancel?: () => void;
  onOutput: (name: string, event?: PointerEvent) => void;
  onInput: (name: string) => void;
  onRewire: (name: string, event: PointerEvent) => void;
  onDisconnect: (name: string) => void;
  onDelete: () => void;
  onActivate: () => void;
  onImage: (file: File) => void;
  loadThumbnail?: (reference: string) => Promise<string>;
}) {
  const definition = materialNodeTypes[node.type];
  const scrubbing = useRef(false);
  const scrubStart = () => {
    scrubbing.current = true;
    onScrubStart();
  };
  const scrubEnd = (cancelled: boolean) => {
    scrubbing.current = false;
    if (cancelled) onScrubCancel?.();
  };
  const updateStop = (
    index: number,
    patch: { position?: number; color?: number[] },
  ) => {
    onChange(
      {
        ...node,
        stops: node.stops?.map((stop, current) =>
          current === index ? { ...stop, ...patch } : stop,
        ),
      },
      !scrubbing.current,
    );
  };
  return (
    <article
      inert={placing}
      data-material-node={node.id}
      data-node-type={node.type}
      data-node-category={materialNodeCategory(node.type)}
      className={`material-node ${selected ? "is-selected" : ""} ${placing ? "is-placing" : ""}`}
      style={{
        left: node.position[0],
        top: -node.position[1],
        width: NODE_WIDTH,
      }}
      onPointerDown={onSelect}
    >
      <header onPointerDown={onDrag}>
        <strong>{node.label || definition?.label || node.type}</strong>
        <button
          type="button"
          aria-label={`Delete ${node.label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onDelete}
        >
          <X size={13} />
        </button>
      </header>
      {materialOutputs(node).map((socket) => (
        <div key={socket.name} className="material-output-row">
          <span>{socket.name}</span>
          <button
            type="button"
            className={`material-socket kind-${socket.kind}`}
            aria-label={`${node.label} output ${socket.name}`}
            data-output={socket.name}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.button === 0) onOutput(socket.name, event);
            }}
            onClick={(event) => {
              if (event.detail === 0) onOutput(socket.name);
            }}
          />
        </div>
      ))}
      {node.type === "principled" && (
        <button
          type="button"
          className="material-physical-toggle"
          aria-expanded={!!node.expanded}
          onClick={() => onChange({ ...node, expanded: !node.expanded })}
        >
          {node.expanded
            ? "− Hide unused physical inputs"
            : "+ Glass, thickness, coat & sheen"}
        </button>
      )}
      {materialInputs(node).map((socket) => {
        const input = node.inputs[socket.name],
          value = input?.value ?? socket.value;
        const changeValue = (value: number | number[]) =>
          onChange(
            {
              ...node,
              inputs: { ...node.inputs, [socket.name]: { value } },
            },
            !scrubbing.current,
          );
        return (
          <div key={socket.name} className="material-input-row">
            <button
              type="button"
              className={`material-socket kind-${socket.kind} ${pending && (pending === "shader") === (socket.kind === "shader") ? "is-target" : ""} ${snappedInput === socket.name ? "is-snapped" : ""}`}
              aria-label={`${node.label} input ${socket.name}`}
              data-input={socket.name}
              onPointerDown={(event) => {
                if (input?.link && !pending && event.button === 0) {
                  event.stopPropagation();
                  onRewire(socket.name, event);
                }
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                onInput(socket.name);
              }}
              onClick={(event) => {
                if (event.detail === 0) onInput(socket.name);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                onDisconnect(socket.name);
              }}
            />
            <span>{socket.name}</span>
            {input?.link ? (
              <button
                className="material-disconnect"
                type="button"
                title="Disconnect"
                aria-label={`Disconnect ${node.label} ${socket.name}`}
                onClick={() => onDisconnect(socket.name)}
              >
                <Unplug size={12} />
                <span>linked</span>
              </button>
            ) : typeof value === "number" ? (
              <Input
                type="number"
                aria-label={`${node.label} ${socket.name}`}
                value={value}
                step="0.01"
                onValueScrubStart={scrubStart}
                onValueScrubEnd={scrubEnd}
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  if (Number.isFinite(value)) changeValue(value);
                }}
              />
            ) : Array.isArray(value) && socket.kind === "color" ? (
              <ColorValue
                value={value}
                label={`${node.label} ${socket.name}`}
                onChange={changeValue}
              />
            ) : Array.isArray(value) && socket.kind === "vector" ? (
              <div style={{ display: "flex", gap: 3, minWidth: 0 }}>
                {value.slice(0, 3).map((component, axis) => (
                  <Input
                    key={axis}
                    type="number"
                    style={{ minWidth: 0, width: "100%", paddingInline: 3 }}
                    aria-label={`${node.label} ${socket.name} ${["X", "Y", "Z"][axis]}`}
                    value={component}
                    step="0.01"
                    onValueScrubStart={scrubStart}
                    onValueScrubEnd={scrubEnd}
                    onChange={(event) => {
                      if (Number.isFinite(event.target.valueAsNumber))
                        changeValue(
                          value.map((entry, index) =>
                            index === axis ? event.target.valueAsNumber : entry,
                          ),
                        );
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="material-node-properties">
        <div
          className={`material-label-editor ${selected ? "is-visible" : ""}`}
          aria-hidden={!selected}
        >
          <Input
            aria-label={`${node.type} node label`}
            value={node.label}
            tabIndex={selected ? 0 : -1}
            readOnly={!selected}
            onChange={(event) =>
              onChange({ ...node, label: event.target.value })
            }
          />
        </div>
        {node.type === "value" && (
          <Input
            aria-label={`${node.label} value`}
            type="number"
            step="0.01"
            onValueScrubStart={scrubStart}
            onValueScrubEnd={scrubEnd}
            value={typeof node.value === "number" ? node.value : 0}
            onChange={(event) => {
              if (Number.isFinite(event.target.valueAsNumber))
                onChange(
                  { ...node, value: event.target.valueAsNumber },
                  !scrubbing.current,
                );
            }}
          />
        )}
        {node.type === "rgb" && (
          <ColorValue
            label={`${node.label} color`}
            value={Array.isArray(node.value) ? node.value : [0.5, 0.5, 0.5]}
            onChange={(value) => onChange({ ...node, value })}
          />
        )}
        {node.type === "ramp" && (
          <>
            <div
              className="material-ramp-preview"
              aria-label={`${node.label} gradient`}
              style={{
                background: `linear-gradient(to right,${[...(node.stops || [])]
                  .sort((first, second) => first.position - second.position)
                  .map((stop) => {
                    const color = new Color().setRGB(
                      stop.color[0],
                      stop.color[1],
                      stop.color[2],
                    );
                    return `#${color.getHexString()}${Math.round(
                      Math.max(0, Math.min(1, stop.color[3])) * 255,
                    )
                      .toString(16)
                      .padStart(2, "0")} ${stop.position * 100}%`;
                  })
                  .join(",")})`,
              }}
            />
            <NativeSelect
              aria-label={`${node.label} interpolation`}
              value={node.interpolation || "linear"}
              onChange={(event) =>
                onChange({ ...node, interpolation: event.target.value })
              }
            >
              <NativeSelectOption value="linear">Linear</NativeSelectOption>
              <NativeSelectOption value="constant">Constant</NativeSelectOption>
              <NativeSelectOption value="ease">Ease</NativeSelectOption>
            </NativeSelect>
            {(node.stops || []).map((stop, index) => (
              <div className="material-ramp-stop" key={index}>
                <span>Stop {index + 1}</span>
                <button
                  type="button"
                  aria-label={`Delete ${node.label} stop ${index + 1}`}
                  disabled={(node.stops?.length || 0) <= 2}
                  onClick={() =>
                    onChange({
                      ...node,
                      stops: node.stops?.filter(
                        (_, current) => current !== index,
                      ),
                    })
                  }
                >
                  <X size={12} />
                </button>
                <label>
                  Position
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step="0.01"
                    aria-label={`${node.label} stop ${index + 1} position`}
                    value={stop.position}
                    onValueScrubStart={scrubStart}
                    onValueScrubEnd={scrubEnd}
                    onChange={(event) => {
                      if (Number.isFinite(event.target.valueAsNumber))
                        updateStop(index, {
                          position: Math.max(
                            0,
                            Math.min(1, event.target.valueAsNumber),
                          ),
                        });
                    }}
                  />
                </label>
                <ColorValue
                  label={`${node.label} stop ${index + 1} color`}
                  value={stop.color}
                  onChange={(color) =>
                    updateStop(index, { color: [...color, stop.color[3]] })
                  }
                />
                <label>
                  Alpha
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step="0.01"
                    aria-label={`${node.label} stop ${index + 1} alpha`}
                    value={stop.color[3]}
                    onValueScrubStart={scrubStart}
                    onValueScrubEnd={scrubEnd}
                    onChange={(event) => {
                      if (Number.isFinite(event.target.valueAsNumber))
                        updateStop(index, {
                          color: [
                            ...stop.color.slice(0, 3),
                            Math.max(
                              0,
                              Math.min(1, event.target.valueAsNumber),
                            ),
                          ],
                        });
                    }}
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="material-ramp-add"
              aria-label={`Add ${node.label} stop`}
              disabled={(node.stops?.length || 0) >= 32}
              onClick={() => {
                const stops = [...(node.stops || [])].sort(
                  (first, second) => first.position - second.position,
                );
                let index = 1;
                for (let current = 2; current < stops.length; current++)
                  if (
                    stops[current].position - stops[current - 1].position >
                    stops[index].position - stops[index - 1].position
                  )
                    index = current;
                const before = stops[index - 1],
                  after = stops[index];
                if (before && after)
                  onChange({
                    ...node,
                    stops: [
                      ...(node.stops || []),
                      {
                        position: (before.position + after.position) / 2,
                        color: before.color.map(
                          (value, channel) =>
                            (value + after.color[channel]) / 2,
                        ),
                      },
                    ],
                  });
              }}
            >
              + Add stop
            </button>
          </>
        )}
        {["mapping", "vectorMath", "mapRange"].includes(node.type) && (
          <NativeSelect
            aria-label={`${node.label} ${node.type === "mapRange" ? "interpolation" : "operation"}`}
            value={
              node.type === "mapRange" ? node.interpolation : node.operation
            }
            onChange={(event) =>
              onChange({
                ...node,
                [node.type === "mapRange" ? "interpolation" : "operation"]:
                  event.target.value,
              })
            }
          >
            {(node.type === "mapping"
              ? ["POINT", "TEXTURE", "VECTOR", "NORMAL"]
              : node.type === "mapRange"
                ? ["LINEAR", "STEPPED", "SMOOTHSTEP", "SMOOTHERSTEP"]
                : [
                    "ADD",
                    "SUBTRACT",
                    "MULTIPLY",
                    "DIVIDE",
                    "SCALE",
                    "CROSS_PRODUCT",
                    "DOT_PRODUCT",
                    "DISTANCE",
                    "LENGTH",
                    "NORMALIZE",
                    "ABSOLUTE",
                    "MINIMUM",
                    "MAXIMUM",
                    "FLOOR",
                    "CEIL",
                    "FRACTION",
                    "SINE",
                    "COSINE",
                  ]
            ).map((operation) => (
              <NativeSelectOption key={operation} value={operation}>
                {operation.toLowerCase().replaceAll("_", " ")}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        {node.type === "bump" && (
          <label className="material-clamp">
            <input
              type="checkbox"
              checked={!!node.invert}
              onChange={(event) =>
                onChange({ ...node, invert: event.target.checked })
              }
            />
            Invert
          </label>
        )}
        {node.type === "normalMap" && (
          <small>Tangent space · UV0 · use a linear image</small>
        )}
        {node.type === "mapping" && (
          <small>Rotation in radians · Blender XYZ order</small>
        )}
        {node.type === "math" && (
          <NativeSelect
            aria-label={`${node.label} operation`}
            value={node.operation}
            onChange={(event) =>
              onChange({ ...node, operation: event.target.value })
            }
          >
            {["ADD", "SUBTRACT", "MULTIPLY", "MINIMUM", "MAXIMUM"].map(
              (operation) => (
                <NativeSelectOption key={operation} value={operation}>
                  {operation.toLowerCase()}
                </NativeSelectOption>
              ),
            )}
          </NativeSelect>
        )}
        {["math", "mix", "mapRange"].includes(node.type) && (
          <label className="material-clamp">
            <input
              type="checkbox"
              checked={!!node.clamp}
              onChange={(event) =>
                onChange({ ...node, clamp: event.target.checked })
              }
            />
            Clamp
          </label>
        )}
        {node.type === "image" && (
          <>
            <ImagePreview node={node} loadThumbnail={loadThumbnail} />
            <label className="material-image-upload">
              {node.image || node.sourceTexture
                ? "Replace image…"
                : "Choose image…"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/ktx2,.ktx2"
                aria-label={`${node.label} image`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onImage(file);
                  event.target.value = "";
                }}
              />
            </label>
            {node.image?.startsWith("data:image/ktx2;") && (
              <span className="text-xs text-muted-foreground">
                KTX2 · GPU compressed
              </span>
            )}
            <NativeSelect
              aria-label={`${node.label} color space`}
              value={node.colorSpace || "srgb"}
              onChange={(event) =>
                onChange({ ...node, colorSpace: event.target.value })
              }
            >
              <NativeSelectOption value="srgb">sRGB color</NativeSelectOption>
              <NativeSelectOption value="linear">
                Linear / non-color
              </NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              aria-label={`${node.label} extension`}
              value={node.extension || "repeat"}
              onChange={(event) =>
                onChange({ ...node, extension: event.target.value })
              }
            >
              {node.sourceTexture && (
                <NativeSelectOption value="source">
                  Model wrap settings
                </NativeSelectOption>
              )}
              <NativeSelectOption value="repeat">Repeat</NativeSelectOption>
              <NativeSelectOption value="extend">Extend</NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              aria-label={`${node.label} interpolation`}
              value={node.interpolation || "linear"}
              onChange={(event) =>
                onChange({ ...node, interpolation: event.target.value })
              }
            >
              {node.sourceTexture && (
                <NativeSelectOption value="source">
                  Model filtering / mipmaps
                </NativeSelectOption>
              )}
              <NativeSelectOption value="linear">Linear</NativeSelectOption>
              <NativeSelectOption value="closest">Closest</NativeSelectOption>
            </NativeSelect>
          </>
        )}
        {node.type === "output" && (
          <button
            type="button"
            className="material-active-output"
            aria-pressed={activeOutput}
            onClick={onActivate}
          >
            {activeOutput ? "Active output" : "Use this output"}
          </button>
        )}
        {!definition && (
          <p>
            Unsupported imported node. Replace it or bake this branch in
            Blender.
          </p>
        )}
        {node.errors?.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
    </article>
  );
}
