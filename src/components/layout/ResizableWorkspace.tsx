import { useRef, type ReactNode } from "react";
import {
  useDefaultLayout,
  type GroupImperativeHandle,
} from "react-resizable-panels";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
export function ResizableWorkspace({
  id,
  left,
  center,
  right,
  leftLabel,
  rightLabel,
  leftSize = 208,
  rightSize = 264,
}: {
  id: string;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  leftLabel: string;
  rightLabel: string;
  leftSize?: number;
  rightSize?: number;
}) {
  const group = useRef<GroupImperativeHandle>(null),
    element = useRef<HTMLDivElement>(null);
  const panelIds = {
    left: `${id}-left`,
    center: `${id}-center`,
    right: `${id}-right`,
  };
  const layout = useDefaultLayout({
    id: `glb-viewer:${id}:v1`,
    onlySaveAfterUserInteractions: true,
  });
  function reset() {
    const width = element.current?.clientWidth;
    if (!width || !group.current) return;
    const left = (leftSize / width) * 100,
      right = (rightSize / width) * 100;
    const sizes = group.current.setLayout({
      [panelIds.left]: left,
      [panelIds.center]: 100 - left - right,
      [panelIds.right]: right,
    });
    layout.onLayoutChanged(sizes, {
      isUserInteraction: true,
      requestedLayout: sizes,
    });
  }
  const handleProps = {
    withHandle: true,
    className: "workspace-resize-handle",
    title: "Drag to resize. Double-click to reset widths.",
    onDoubleClick: reset,
  };
  return (
    <ResizablePanelGroup
      id={id}
      className="resizable-workspace-group"
      orientation="horizontal"
      elementRef={element}
      groupRef={group}
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <ResizablePanel
        className="workspace-panel-content"
        style={{
          height: "100%",
          width: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        id={panelIds.left}
        defaultSize={leftSize}
        minSize={160}
        maxSize="60%"
      >
        {left}
      </ResizablePanel>
      <ResizableHandle
        {...handleProps}
        id={`${id}-left-divider`}
        aria-label={`Resize ${leftLabel}`}
      />
      <ResizablePanel
        className="workspace-panel-content"
        style={{
          height: "100%",
          width: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        id={panelIds.center}
        minSize={240}
      >
        {center}
      </ResizablePanel>
      <ResizableHandle
        {...handleProps}
        id={`${id}-right-divider`}
        aria-label={`Resize ${rightLabel}`}
      />
      <ResizablePanel
        className="workspace-panel-content"
        style={{
          height: "100%",
          width: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        id={panelIds.right}
        defaultSize={rightSize}
        minSize={240}
        maxSize="55%"
      >
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
