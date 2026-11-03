import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PerformancePanel } from "@/components/performance/PerformancePanel";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { SceneSidebar } from "@/components/layout/SceneSidebar";
import { KeyboardHelp } from "@/components/layout/KeyboardHelp";
import { Viewport } from "@/components/viewer/Viewport";
import { ModelInspector } from "@/components/viewer/ModelInspector";
import { WorkbenchWorkspace } from "@/components/workbench/WorkbenchWorkspace";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { useModelViewer } from "@/hooks/use-model-viewer";
import { useWorkspaceNavigation } from "@/hooks/use-workspace-navigation";
import { useWorkbench } from "@/hooks/use-workbench";
import { loadFiles, readEntry } from "@/viewer/files";
import type { ModelFile } from "@/model-types";
import { errorMessage } from "@/lib/format";
export function App() {
  const sourceHandler = useRef<(file: ModelFile) => void>(() => {}),
    viewer = useModelViewer((file) => sourceHandler.current(file)),
    workbench = useWorkbench(viewer.load),
    navigation = useWorkspaceNavigation(workbench);
  sourceHandler.current = workbench.sourceLoaded;
  const filesRef = useRef<HTMLInputElement>(null),
    dragDepth = useRef(0),
    [dragging, setDragging] = useState(false),
    [help, setHelp] = useState(false);
  const open = useCallback(async () => {
    try {
      if (window.desktop) {
        const file = await window.desktop.chooseModel();
        if (file) {
          workbench.sourceLoaded(file);
          await viewer.load(file);
        }
      } else filesRef.current?.click();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [viewer.load]);
  useEffect(
    () =>
      window.desktop?.onOpen((file) => {
        workbench.sourceLoaded(file);
        void viewer.load(file).catch(() => {});
      }),
    [viewer.load],
  );
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (
        (event.target as HTMLElement).closest(
          'input,select,textarea,[role="dialog"]',
        ) ||
        workbench.open ||
        help
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        if (!window.desktop) void open();
      }
      if (event.key.toLowerCase() === "f") viewer.frame();
      if (event.key === "Escape") viewer.clearSelection();
      if (event.code === "Space") {
        event.preventDefault();
        viewer.play();
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [viewer, workbench.open, help, open]);
  useEffect(() => {
    const enter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const over = (event: DragEvent) => event.preventDefault();
    const leave = () => {
      if (--dragDepth.current <= 0) {
        dragDepth.current = 0;
        setDragging(false);
      }
    };
    const drop = async (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      try {
        const entries = Array.from(event.dataTransfer?.items || [])
          .map((item) => item.webkitGetAsEntry())
          .filter((entry): entry is FileSystemEntry => !!entry);
        if (entries.length)
          await loadFiles(
            (
              await Promise.all(entries.map((entry) => readEntry(entry)))
            ).flat(),
            viewer.load,
          );
      } catch (error) {
        toast.error(errorMessage(error));
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [viewer.load]);
  return (
    <TooltipProvider>
      <AppHeader
        name={workbench.source?.name || viewer.state.name}
        demo={!workbench.source && viewer.state.demo}
        onOpen={open}
        onHelp={() => setHelp(true)}
        navigation={navigation}
      />
      <WorkspaceNavigation workbench={workbench} navigation={navigation} />
      <div
        className={`app-workspace ${workbench.tab === "performance" ? "performance-mode" : ""}`}
        style={workbench.open ? { display: "none" } : undefined}
      >
        <SceneSidebar
          state={viewer.state}
          onSelect={viewer.selectObject}
          onClearSelection={viewer.clearSelection}
          onHelp={() => setHelp(true)}
        />
        <Viewport viewer={viewer} dragging={dragging} onOpen={open} />
        {workbench.tab === "performance" ? (
          <PerformancePanel viewer={viewer} />
        ) : (
          <ModelInspector viewer={viewer} />
        )}
      </div>
      <Input
        ref={filesRef}
        id="files"
        type="file"
        accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files;
          if (files)
            void loadFiles(
              Array.from(files, (file) => ({
                file,
                path: file.webkitRelativePath || file.name,
              })),
              viewer.load,
            ).catch((error) => toast.error(errorMessage(error)));
          event.target.value = "";
        }}
      />
      <KeyboardHelp open={help} onOpenChange={setHelp} />
      <WorkbenchWorkspace
        workbench={workbench}
        viewer={viewer}
        onFocus={async (index) => {
          try {
            if (
              workbench.source &&
              (viewer.state.name !== workbench.source.name ||
                viewer.state.error)
            )
              await viewer.load(workbench.source);
            workbench.setTab("model");
            workbench.setOpen(false);
            viewer.focusSourceNode(index);
          } catch (error) {
            workbench.notify(errorMessage(error), true);
          }
        }}
      />
      <Toaster theme="dark" position="bottom-center" />
    </TooltipProvider>
  );
}
