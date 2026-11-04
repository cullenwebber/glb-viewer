import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { read as readKTX } from "ktx-parse";
import {
  Plus,
  Undo2,
  Redo2,
  Scan,
  Download,
  Upload,
  LayoutGrid,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { download, errorMessage } from "@/lib/format";
import {
  materialNodeTypes,
  materialNodeCategory,
  materialInputs,
  materialNodeHeight,
  insertMaterialNode,
  findMaterialWireInsertion,
  createMaterialNode,
  createMaterialGraph,
  parseMaterialGraph,
  connectMaterialNodes,
  disconnectMaterialInput,
  removeMaterialNodes,
  arrangeMaterialGraph,
  nearestMaterialSocket,
  type MaterialGraph,
  type MaterialNode,
} from "@/lib/material-editor";
import {
  compileMaterialGraph,
  materialModule,
} from "../../../electron/pipeline/material-graph.mjs";
import type { ViewerController } from "@/hooks/use-model-viewer";
import {
  MaterialNodeCard,
  NODE_WIDTH,
  socketY,
  wirePath,
} from "./MaterialNodeCard";
import "./materials.css";

export function MaterialsWorkspace({
  viewer,
  active,
}: {
  viewer: ViewerController;
  active: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, MaterialGraph>>({});
  const [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const [placing, setPlacing] = useState<MaterialNode | null>(null);
  const [moving, setMoving] = useState(false);
  const movementFrame = useRef<number | null>(null);
  const queuedGraph = useRef<MaterialGraph | null>(null);
  const spaceHeld = useRef(false);
  const savedViews = useRef(
    new Map<string, { x: number; y: number; zoom: number }>(),
  );
  const [pending, setPending] = useState<{
    node: string;
    socket: string;
  } | null>(null);
  const [snapTarget, setSnapTarget] =
    useState<ReturnType<typeof nearestMaterialSocket>>(null);
  const [rewire, setRewire] = useState<{ node: string; input: string } | null>(
    null,
  );
  const [insertTarget, setInsertTarget] = useState<{
    node: string;
    input: string;
  } | null>(null);
  const wireDrag = useRef<{ pointer: number; x: number; y: number } | null>(
    null,
  );
  const [status, setStatus] = useState(""),
    [message, setMessage] = useState("");
  const [view, setView] = useState({ x: 40, y: 180, zoom: 0.75 }),
    [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [, refreshHistory] = useState(0);
  const canvas = useRef<HTMLDivElement>(null),
    searchInput = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null);
  const history = useRef(
    new Map<string, { undo: MaterialGraph[]; redo: MaterialGraph[] }>(),
  );
  const drag = useRef<{
    pointer: number;
    node?: string;
    x: number;
    y: number;
    originX: number;
    originY: number;
    original?: MaterialGraph;
    started?: boolean;
  } | null>(null);
  const slots = viewer.state.materialSlots;
  const target =
    slots.find((slot) => slot.key === viewer.state.activeMaterialKey) ||
    slots[0];
  const key = target?.key || "",
    graph = drafts[key] || target?.graph;
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const keys = new Set(slots.map((slot) => slot.key));
    setDrafts((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([key]) => keys.has(key)),
      ),
    );
    for (const key of history.current.keys())
      if (!keys.has(key)) history.current.delete(key);
    for (const key of savedViews.current.keys())
      if (!keys.has(key)) savedViews.current.delete(key);
  }, [slots.map((slot) => slot.key).join("|")]);
  useEffect(() => {
    setSelected(null);
    setPlacing(null);
    setMoving(false);
    drag.current = null;
    queuedGraph.current = null;
    if (movementFrame.current !== null)
      cancelAnimationFrame(movementFrame.current);
    movementFrame.current = null;
    setPending(null);
    setSnapTarget(null);
    setRewire(null);
    wireDrag.current = null;
    setStatus("");
    setMessage("");
  }, [key]);
  const signature =
    graph &&
    JSON.stringify({
      ...graph,
      nodes: graph.nodes.map(
        ({ position: _position, expanded: _expanded, ...node }) => node,
      ),
    });
  const validation = useMemo(() => {
    if (!graph) return "No material loaded.";
    try {
      compileMaterialGraph(graph);
      return "";
    } catch (error) {
      return errorMessage(error);
    }
  }, [signature]);
  useEffect(
    () => () => {
      if (movementFrame.current !== null)
        cancelAnimationFrame(movementFrame.current);
    },
    [],
  );
  useEffect(() => {
    if (!active || !graph || !drafts[key]) return;
    if (validation) {
      setStatus("Invalid graph · keeping the last valid preview");
      return;
    }
    let cancelled = false;
    setStatus("Updating preview…");
    const timer = setTimeout(() => {
      void viewer
        .previewMaterialGraph(key, graph)
        .then(() => {
          if (!cancelled) setStatus("Live preview updated");
        })
        .catch((error) => {
          if (!cancelled) {
            setStatus("Preview failed");
            setMessage(errorMessage(error));
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [signature, key, active, !!drafts[key], viewer.previewMaterialGraph]);
  function remember() {
    const graph = graphRef.current;
    if (!graph) return;
    const entry = history.current.get(key) || { undo: [], redo: [] };
    entry.undo = [...entry.undo.slice(-39), graph];
    entry.redo = [];
    history.current.set(key, entry);
    refreshHistory((value) => value + 1);
  }
  function update(next: MaterialGraph, checkpoint = true) {
    if (checkpoint) remember();
    setMessage("");
    graphRef.current = next;
    setDrafts((previous) => ({ ...previous, [key]: next }));
  }
  function queueMovement(next: MaterialGraph) {
    graphRef.current = next;
    queuedGraph.current = next;
    if (movementFrame.current !== null) return;
    movementFrame.current = requestAnimationFrame(() => {
      movementFrame.current = null;
      if (queuedGraph.current) update(queuedGraph.current, false);
      queuedGraph.current = null;
    });
  }
  function finishMovement() {
    if (movementFrame.current !== null)
      cancelAnimationFrame(movementFrame.current);
    movementFrame.current = null;
    if (queuedGraph.current) update(queuedGraph.current, false);
    queuedGraph.current = null;
    setMoving(false);
  }
  function undo(redo = false) {
    if (!graph) return;
    const entry = history.current.get(key);
    if (!entry) return;
    const source = redo ? entry.redo : entry.undo,
      destination = redo ? entry.undo : entry.redo;
    const next = source.pop();
    if (!next) return;
    destination.push(graph);
    update(next, false);
    refreshHistory((value) => value + 1);
  }
  function updateNode(next: MaterialNode, checkpoint = true) {
    if (graph)
      update(
        {
          ...graph,
          nodes: graph.nodes.map((node) => (node.id === next.id ? next : node)),
        },
        checkpoint,
      );
  }
  function fit(next = graph) {
    const bounds = canvas.current?.getBoundingClientRect();
    if (!next?.nodes.length || !bounds) return;
    const minX = Math.min(...next.nodes.map((node) => node.position[0])),
      minY = Math.min(...next.nodes.map((node) => -node.position[1]));
    const width =
      Math.max(...next.nodes.map((node) => node.position[0] + NODE_WIDTH)) -
      minX;
    const height =
      Math.max(
        ...next.nodes.map(
          (node) => -node.position[1] + materialNodeHeight(node),
        ),
      ) - minY;
    const zoom = Math.max(
      0.2,
      Math.min(1, (bounds.width - 64) / width, (bounds.height - 64) / height),
    );
    setView({
      x: (bounds.width - width * zoom) / 2 - minX * zoom,
      y: (bounds.height - height * zoom) / 2 - minY * zoom,
      zoom,
    });
  }
  useEffect(() => {
    if (!active || !key) {
      setPlacing(null);
      return;
    }
    const previous = savedViews.current.get(key);
    const frame = requestAnimationFrame(() =>
      previous ? setView(previous) : fit(graphRef.current),
    );
    return () => {
      cancelAnimationFrame(frame);
      savedViews.current.set(key, viewRef.current);
    };
  }, [key, active]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect(),
        current = viewRef.current;
      const zoom = Math.max(
        0.2,
        Math.min(1.75, current.zoom * Math.exp(-event.deltaY * 0.0015)),
      );
      const pointerX = event.clientX - bounds.left,
        pointerY = event.clientY - bounds.top;
      setView({
        x: pointerX - ((pointerX - current.x) * zoom) / current.zoom,
        y: pointerY - ((pointerY - current.y) * zoom) / current.zoom,
        zoom,
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  function add(type: string) {
    if (!graph) return;
    if (graph.nodes.length >= 512) {
      setMessage("Maximum 512 nodes per material.");
      return;
    }
    const bounds = canvas.current?.getBoundingClientRect();
    if (!bounds) return;
    setPlacing(
      createMaterialNode(type, [
        (bounds.width / 2 - view.x) / view.zoom - NODE_WIDTH / 2,
        -(bounds.height / 3 - view.y) / view.zoom,
      ]),
    );
    setSelected(null);
    setPending(null);
    setRewire(null);
    setSnapTarget(null);
    setInsertTarget(null);
    canvas.current?.focus({ preventScroll: true });
  }
  function placeNode(point: { x: number; y: number }, snap = false) {
    if (!placing || !graph) return;
    const position = [point.x - NODE_WIDTH / 2, 17 - point.y].map((value) =>
      Math.max(
        -10000,
        Math.min(10000, snap ? Math.round(value / 20) * 20 : value),
      ),
    );
    const node = { ...placing, position };
    let next = { ...graph, nodes: [...graph.nodes, node] };
    const target = findMaterialWireInsertion(next, node.id);
    if (target)
      next = insertMaterialNode(next, node.id, target.node, target.input);
    update(next);
    setSelected(node.id);
    setPlacing(null);
    setInsertTarget(null);
  }
  function connect(node: string, input: string) {
    if (!graph || !pending) return;
    try {
      update(
        connectMaterialNodes(
          rewire
            ? disconnectMaterialInput(graph, rewire.node, rewire.input)
            : graph,
          pending.node,
          pending.socket,
          node,
          input,
        ),
      );
      setPending(null);
      setSnapTarget(null);
      setRewire(null);
    } catch (error) {
      setMessage(errorMessage(error));
      setPending(null);
      setSnapTarget(null);
      setRewire(null);
    }
  }
  function pointerPoint(event: { clientX: number; clientY: number }) {
    const bounds = canvas.current!.getBoundingClientRect(),
      current = viewRef.current;
    return {
      x: (event.clientX - bounds.left - current.x) / current.zoom,
      y: (event.clientY - bounds.top - current.y) / current.zoom,
    };
  }
  function beginWire(
    node: string,
    socket: string,
    event?: PointerEvent,
    origin: typeof rewire = null,
  ) {
    if (event && event.button !== 0) return;
    setPending({ node, socket });
    setRewire(origin);
    setSnapTarget(null);
    setMessage("");
    drag.current = null;
    if (event) {
      setCursor(pointerPoint(event));
      wireDrag.current = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      canvas.current?.setPointerCapture(event.pointerId);
    }
    canvas.current?.focus({ preventScroll: true });
  }
  function removeSelected() {
    if (graph && selected) {
      update(removeMaterialNodes(graph, [selected]));
      setSelected(null);
    }
  }
  async function image(node: MaterialNode, file: File) {
    try {
      if (file.size > 24 * 1024 * 1024)
        throw new Error("Choose an image smaller than 24 MB.");
      let encoded: string;
      if (
        file.name.toLowerCase().endsWith(".ktx2") ||
        file.type === "image/ktx2"
      ) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const container = readKTX(bytes);
        if (
          container.faceCount !== 1 ||
          container.layerCount > 1 ||
          container.pixelDepth > 0
        )
          throw new Error(
            "Image Texture supports 2D KTX2 textures, not cubes, arrays, or volumes.",
          );
        if (container.pixelWidth > 8192 || container.pixelHeight > 8192)
          throw new Error("Image dimensions must not exceed 8192 pixels.");
        encoded = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () =>
            reject(new Error("Could not read KTX2 texture."));
          reader.onload = () =>
            resolve(
              "data:image/ktx2;base64," + String(reader.result).split(",")[1],
            );
          reader.readAsDataURL(file);
        });
      } else {
        const bitmap = await createImageBitmap(file);
        try {
          if (bitmap.width > 8192 || bitmap.height > 8192)
            throw new Error("Image dimensions must not exceed 8192 pixels.");
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
          encoded = canvas.toDataURL("image/png");
        } finally {
          bitmap.close();
        }
      }
      if (encoded.length > 32 * 1024 * 1024)
        throw new Error("Encoded texture exceeds the 32 MB graph limit.");
      const current = graphRef.current;
      if (
        current?.id === graph?.id &&
        current?.nodes.some((entry) => entry.id === node.id)
      )
        update({
          ...current,
          nodes: current.nodes.map((entry) =>
            entry.id === node.id
              ? {
                  ...entry,
                  image: encoded,
                  sourceTexture: undefined,
                  imageName: file.name,
                  imageSize: undefined,
                  uvChannel: undefined,
                  extension: "repeat",
                  interpolation: "linear",
                  errors: [],
                }
              : entry,
          ),
        });
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  function exportFile(tsl: boolean) {
    if (!graph) return;
    try {
      const name = graph.name.replace(/[^\w.-]/g, "-") || "material";
      download(
        new TextEncoder().encode(
          tsl ? materialModule(graph) : JSON.stringify(graph, null, 2),
        ),
        name + (tsl ? ".material.ts" : ".material.json"),
      );
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  async function importGraph(file: File) {
    try {
      if (file.size > 64 * 1024 * 1024)
        throw new Error("Graph file exceeds 64 MB.");
      update(parseMaterialGraph(await file.text()));
      setSelected(null);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  const entry = history.current.get(key);
  return (
    <section
      id="materials-workspace"
      className="materials-workspace"
      aria-label="Material node workspace"
      style={{ display: active ? "flex" : "none" }}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("input,textarea,select"))
          return;
        if (event.code === "Space") {
          event.preventDefault();
          spaceHeld.current = true;
          return;
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "z"
        ) {
          event.preventDefault();
          undo(event.shiftKey);
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          removeSelected();
        } else if (event.shiftKey && event.key.toLowerCase() === "a") {
          event.preventDefault();
          searchInput.current?.focus();
        } else if (
          event.shiftKey &&
          event.key.toLowerCase() === "d" &&
          graph &&
          selected
        ) {
          event.preventDefault();
          const node = graph.nodes.find((node) => node.id === selected);
          if (node && graph.nodes.length < 512) {
            const copy = {
              ...structuredClone(node),
              id: crypto.randomUUID(),
              position: [node.position[0] + 40, node.position[1] - 40],
            };
            update({ ...graph, nodes: [...graph.nodes, copy] });
            setSelected(copy.id);
          }
        } else if (event.key === "Home") {
          event.preventDefault();
          fit();
        } else if (event.key === "Escape") {
          setPlacing(null);
          setInsertTarget(null);
          const original = drag.current?.original;
          finishMovement();
          if (original && drag.current?.started) {
            update(original, false);
            history.current.get(key)?.undo.pop();
            refreshHistory((value) => value + 1);
          }
          drag.current = null;
          setPending(null);
          setSnapTarget(null);
          setRewire(null);
          wireDrag.current = null;
          setSelected(null);
        }
      }}
      onKeyUp={(event) => {
        if (event.code === "Space") spaceHeld.current = false;
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          spaceHeld.current = false;
      }}
    >
      <div className="materials-toolbar">
        <h1>Materials</h1>
        <NativeSelect
          aria-label="Target material"
          value={key}
          onChange={(event) => viewer.selectMaterial(event.target.value)}
        >
          {slots.map((slot, index) => (
            <NativeSelectOption key={slot.key} value={slot.key}>
              {slot.name} · {index + 1}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span
          className="material-selection-context"
          aria-label="Material assignment"
        >
          {viewer.state.selectedName
            ? `${viewer.state.selectedName}: `
            : "Used by: "}
          {viewer.state.nodes
            .filter((node) => node.materialKeys.includes(key))
            .map((node) => node.name)
            .join(", ") || "No mesh assignment"}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Undo material edit"
          disabled={!entry?.undo.length}
          onClick={() => undo()}
        >
          <Undo2 />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Redo material edit"
          disabled={!entry?.redo.length}
          onClick={() => undo(true)}
        >
          <Redo2 />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Fit material graph"
          onClick={() => fit()}
        >
          <Scan />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Arrange material nodes"
          disabled={!graph}
          onClick={() => {
            if (graph) {
              const next = arrangeMaterialGraph(graph);
              update(next);
              fit(next);
            }
          }}
        >
          <LayoutGrid />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Delete selected node"
          disabled={!selected}
          onClick={removeSelected}
        >
          <Trash2 />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => importInput.current?.click()}
        >
          <Upload />
          Import
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!graph}
          onClick={() => exportFile(false)}
        >
          Save graph
        </Button>
        <Button
          size="sm"
          disabled={!!validation}
          onClick={() => exportFile(true)}
        >
          <Download />
          Export TSL
        </Button>
        <input
          ref={importInput}
          aria-label="Import material graph"
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importGraph(file);
            event.target.value = "";
          }}
        />
      </div>
      {(graph?.nodes.some((node) => node.sourceTexture) ||
        graph?.warnings?.length) && (
        <div className="material-source-note">
          {graph.nodes.some((node) => node.sourceTexture) && (
            <p>
              Model textures are referenced, not duplicated. Exported TSL needs
              a resolveTexture callback for the loaded model.
            </p>
          )}
          {graph.warnings?.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}
      <div className="materials-body">
        <aside className="material-palette" aria-label="Material node palette">
          {graph && (
            <Input
              aria-label="Material graph name"
              value={graph.name}
              onChange={(event) =>
                update({ ...graph, name: event.target.value })
              }
            />
          )}
          <Input
            ref={searchInput}
            aria-label="Search material nodes"
            placeholder="Search nodes… ⇧A"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const match = Object.entries(materialNodeTypes).find(
                  ([, node]) =>
                    node.label.toLowerCase().includes(search.toLowerCase()),
                );
                if (match) {
                  event.preventDefault();
                  add(match[0]);
                }
              } else if (event.key === "Escape") {
                setSearch("");
                canvas.current?.focus({ preventScroll: true });
              }
            }}
          />
          {[
            "Input",
            "Texture",
            "Color",
            "Vector",
            "Converter",
            "Shader",
            "Output",
          ].map((category) => {
            const entries = Object.entries(materialNodeTypes).filter(
              ([type, node]) =>
                materialNodeCategory(type) === category &&
                node.label.toLowerCase().includes(search.toLowerCase()),
            );
            if (!entries.length) return null;
            return (
              <div className="material-palette-group" key={category}>
                <span>{category}</span>
                {entries.map(([type, node]) => (
                  <Button
                    key={type}
                    size="sm"
                    variant="ghost"
                    aria-label={`Add ${node.label} node`}
                    onClick={() => add(type)}
                  >
                    <Plus />
                    {node.label}
                  </Button>
                ))}
              </div>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (target) update(createMaterialGraph(target.name));
            }}
          >
            New graph
          </Button>
          {graph && (
            <label className="material-transparency">
              <input
                type="checkbox"
                checked={!!graph.transparent}
                onChange={(event) =>
                  update({ ...graph, transparent: event.target.checked })
                }
              />
              Alpha blending
            </label>
          )}
        </aside>
        <div
          ref={canvas}
          className={`material-canvas ${placing ? "is-placing" : ""} ${moving ? "is-moving" : ""}`}
          style={{
            backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
          tabIndex={0}
          role="application"
          aria-label="Material node editor"
          onPointerDownCapture={(event) => {
            if (placing && event.button === 0) {
              event.preventDefault();
              event.stopPropagation();
              placeNode(pointerPoint(event), event.shiftKey);
              return;
            }
            if (
              event.button === 1 ||
              (event.button === 0 && spaceHeld.current)
            ) {
              event.preventDefault();
              event.stopPropagation();
              canvas.current?.focus({ preventScroll: true });
              drag.current = {
                pointer: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                originX: view.x,
                originY: view.y,
              };
              setMoving(true);
              event.currentTarget.setPointerCapture(event.pointerId);
              return;
            }
            if (event.button !== 0 || !graph || pending) return;
            if (
              (event.target as HTMLElement).closest(
                "input,select,textarea,header,button:not(.material-socket)",
              )
            )
              return;
            const point = pointerPoint(event);
            const connected = nearestMaterialSocket(
              graph,
              point,
              "inputs",
              18 / view.zoom,
            );
            const link =
              connected &&
              graph.nodes.find((node) => node.id === connected.node)?.inputs[
                connected.socket
              ]?.link;
            if (connected && link) {
              event.stopPropagation();
              beginWire(link.node, link.socket, event, {
                node: connected.node,
                input: connected.socket,
              });
              return;
            }
            const socket = nearestMaterialSocket(
              graph,
              point,
              "outputs",
              18 / view.zoom,
            );
            if (socket) {
              event.stopPropagation();
              beginWire(socket.node, socket.socket, event);
            }
          }}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("[data-material-node]"))
              return;
            if (pending) {
              event.currentTarget.setPointerCapture(event.pointerId);
              return;
            }
            canvas.current?.focus({ preventScroll: true });
            setSelected(null);
            setPending(null);
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              originX: view.x,
              originY: view.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const point = pointerPoint(event);
            setCursor(point);
            if (placing && graph) {
              const position = [point.x - NODE_WIDTH / 2, 17 - point.y].map(
                (value) =>
                  Math.max(
                    -10000,
                    Math.min(
                      10000,
                      event.shiftKey ? Math.round(value / 20) * 20 : value,
                    ),
                  ),
              );
              const next = { ...placing, position };
              setPlacing(next);
              setInsertTarget(
                findMaterialWireInsertion(
                  { ...graph, nodes: [...graph.nodes, next] },
                  next.id,
                ),
              );
              return;
            }
            if (pending && graph)
              setSnapTarget(
                nearestMaterialSocket(
                  graph,
                  point,
                  "inputs",
                  26 / view.zoom,
                  pending,
                ),
              );
            const current = drag.current;
            if (!current) return;
            if (current.node && graph) {
              if (!current.started) {
                if (
                  Math.hypot(
                    event.clientX - current.x,
                    event.clientY - current.y,
                  ) < 3
                )
                  return;
                remember();
                current.started = true;
                setMoving(true);
              }
              const currentGraph = graphRef.current || graph;
              const node = currentGraph.nodes.find(
                (node) => node.id === current.node,
              );
              if (node) {
                const moved = {
                  ...node,
                  position: [
                    Math.max(
                      -10000,
                      Math.min(
                        10000,
                        current.originX +
                          (event.clientX - current.x) / view.zoom,
                      ),
                    ),
                    Math.max(
                      -10000,
                      Math.min(
                        10000,
                        current.originY -
                          (event.clientY - current.y) / view.zoom,
                      ),
                    ),
                  ].map((value) =>
                    event.shiftKey ? Math.round(value / 20) * 20 : value,
                  ),
                };
                setInsertTarget(
                  findMaterialWireInsertion(
                    {
                      ...currentGraph,
                      nodes: currentGraph.nodes.map((entry) =>
                        entry.id === node.id ? moved : entry,
                      ),
                    },
                    node.id,
                  ),
                );
                queueMovement({
                  ...currentGraph,
                  nodes: currentGraph.nodes.map((entry) =>
                    entry.id === node.id ? moved : entry,
                  ),
                });
              }
            } else
              setView({
                ...view,
                x: current.originX + event.clientX - current.x,
                y: current.originY + event.clientY - current.y,
              });
          }}
          onPointerUp={(event) => {
            finishMovement();
            const moved = drag.current?.node;
            if (moved && graphRef.current && !pending) {
              const target = findMaterialWireInsertion(graphRef.current, moved);
              if (target)
                update(
                  insertMaterialNode(
                    graphRef.current,
                    moved,
                    target.node,
                    target.input,
                  ),
                  false,
                );
            }
            setInsertTarget(null);
            if (pending && graph) {
              const target = nearestMaterialSocket(
                graph,
                pointerPoint(event),
                "inputs",
                26 / view.zoom,
                pending,
              );
              if (target) connect(target.node, target.socket);
              else if (
                wireDrag.current &&
                Math.hypot(
                  event.clientX - wireDrag.current.x,
                  event.clientY - wireDrag.current.y,
                ) > 5
              ) {
                if (rewire)
                  update(
                    disconnectMaterialInput(graph, rewire.node, rewire.input),
                  );
                setPending(null);
                setSnapTarget(null);
                setRewire(null);
              }
            }
            wireDrag.current = null;
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            const original = drag.current?.original;
            finishMovement();
            if (original && drag.current?.started) {
              update(original, false);
              history.current.get(key)?.undo.pop();
            }
            setInsertTarget(null);
            drag.current = null;
            wireDrag.current = null;
            setPending(null);
            setSnapTarget(null);
            setRewire(null);
          }}
          onContextMenu={(event) => {
            if (placing) {
              event.preventDefault();
              setPlacing(null);
              setInsertTarget(null);
              return;
            }
            if (!pending) return;
            event.preventDefault();
            setPending(null);
            setSnapTarget(null);
            setRewire(null);
            wireDrag.current = null;
          }}
        >
          <div
            className="material-graph-layer"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            }}
          >
            <svg
              className="material-wires"
              width="1"
              height="1"
              aria-hidden="true"
            >
              {graph?.nodes.flatMap((node) =>
                Object.entries(node.inputs).map(([input, socket]) => {
                  if (
                    pending &&
                    rewire?.node === node.id &&
                    rewire.input === input
                  )
                    return null;
                  const source = graph.nodes.find(
                    (source) => source.id === socket.link?.node,
                  );
                  if (!source || !socket.link) return null;
                  const startX = source.position[0] + NODE_WIDTH,
                    startY =
                      -source.position[1] +
                      socketY(source, socket.link.socket, "outputs");
                  const endX = node.position[0],
                    endY = -node.position[1] + socketY(node, input, "inputs");
                  return (
                    <path
                      key={`${node.id}-${input}`}
                      data-material-wire="true"
                      data-wire-target={node.id}
                      data-wire-input={input}
                      className={
                        insertTarget?.node === node.id &&
                        insertTarget.input === input
                          ? "is-insert-target"
                          : ""
                      }
                      d={wirePath(startX, startY, endX, endY)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        update(disconnectMaterialInput(graph, node.id, input));
                      }}
                    />
                  );
                }),
              )}
            </svg>
            <svg
              className="material-wires material-wire-overlay"
              width="1"
              height="1"
              aria-hidden="true"
            >
              {pending &&
                graph &&
                (() => {
                  const source = graph.nodes.find(
                    (node) => node.id === pending.node,
                  );
                  if (!source) return null;
                  const startX = source.position[0] + NODE_WIDTH,
                    startY =
                      -source.position[1] +
                      socketY(source, pending.socket, "outputs");
                  return (
                    <path
                      className={`is-pending ${snapTarget ? "is-snapped" : ""}`}
                      data-pending-wire="true"
                      d={wirePath(
                        startX,
                        startY,
                        snapTarget?.x ?? cursor.x,
                        snapTarget?.y ?? cursor.y,
                      )}
                    />
                  );
                })()}
            </svg>
            {[...(graph?.nodes || []), ...(placing ? [placing] : [])].map(
              (node) => (
                <MaterialNodeCard
                  key={node.id}
                  node={node}
                  placing={placing?.id === node.id}
                  selected={selected === node.id || placing?.id === node.id}
                  activeOutput={graph?.output === node.id}
                  pending={
                    pending
                      ? materialNodeTypes[
                          graph.nodes.find((node) => node.id === pending.node)
                            ?.type || ""
                        ]?.outputs.find(
                          (socket) => socket.name === pending.socket,
                        )?.kind === "shader"
                        ? "shader"
                        : "value"
                      : null
                  }
                  snappedInput={
                    snapTarget?.node === node.id ? snapTarget.socket : null
                  }
                  onSelect={() => setSelected(node.id)}
                  onDrag={(event) => {
                    if (event.button !== 0) return;
                    event.stopPropagation();
                    setPending(null);
                    setSnapTarget(null);
                    setRewire(null);
                    setInsertTarget(null);
                    setSelected(node.id);
                    drag.current = {
                      pointer: event.pointerId,
                      node: node.id,
                      x: event.clientX,
                      y: event.clientY,
                      originX: node.position[0],
                      originY: node.position[1],
                      original: graph,
                    };
                    canvas.current?.setPointerCapture(event.pointerId);
                    canvas.current?.focus({ preventScroll: true });
                  }}
                  onChange={updateNode}
                  onScrubStart={remember}
                  onScrubCancel={() => {
                    history.current.get(key)?.undo.pop();
                    refreshHistory((value) => value + 1);
                  }}
                  onOutput={(socket, event) =>
                    beginWire(node.id, socket, event)
                  }
                  onInput={(input) => connect(node.id, input)}
                  onRewire={(input, event) => {
                    const link = node.inputs[input]?.link;
                    if (link)
                      beginWire(link.node, link.socket, event, {
                        node: node.id,
                        input,
                      });
                  }}
                  onDisconnect={(input) =>
                    update(disconnectMaterialInput(graph, node.id, input))
                  }
                  onDelete={() => {
                    update(removeMaterialNodes(graph, [node.id]));
                    setSelected(null);
                  }}
                  onActivate={() => update({ ...graph, output: node.id })}
                  onImage={(file) => {
                    void image(node, file);
                  }}
                  loadThumbnail={viewer.textureThumbnail}
                />
              ),
            )}
          </div>
          {!graph && (
            <p className="material-empty">
              Open a model to edit its materials.
            </p>
          )}
          <div className="material-canvas-hint">
            {placing
              ? "Click to place · Shift snaps to grid · Drop on a wire to insert · Esc cancels"
              : pending
                ? "Drop near a highlighted input to snap · Click-to-connect also works · Esc cancels"
                : "Drag background to pan · Scroll to zoom · ⇧A add · ⇧D duplicate · Delete remove"}
            <span>{Math.round(view.zoom * 100)}%</span>
          </div>
        </div>
      </div>
      <div
        className={`material-editor-status ${message || validation ? "has-error" : ""}`}
        role="status"
      >
        <span>
          {message ||
            validation ||
            status ||
            "Connect an output socket to an input socket. Changes preview on the target material."}
        </span>
        <span>
          Drafts stay in this session. Export TSL separately; GLB exports keep
          source materials.
        </span>
      </div>
    </section>
  );
}
