import { useEffect, useRef, useState } from "react";
import {
  Box,
  ImageIcon,
  Network,
  ShieldCheck,
  Activity,
  Shapes,
  Layers,
  SlidersHorizontal,
  Columns2,
  ChartColumn,
  History,
  Download,
  Folders,
  Gauge,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { WatchControl } from "./WatchControl";
import { workspaceSections } from "@/lib/workspace-navigation";
import type { WorkbenchState } from "@/hooks/use-workbench";
import type { WorkspaceNavigator } from "@/hooks/use-workspace-navigation";
const icons = {
  model: Box,
  textures: ImageIcon,
  materials: Network,
  checks: ShieldCheck,
  performance: Activity,
  geometry: Shapes,
  packing: Layers,
  presets: SlidersHorizontal,
  compare: Columns2,
  report: ChartColumn,
  history: History,
  export: Download,
  batch: Folders,
  budgets: Gauge,
};
export function WorkspaceSidebar({
  workbench: w,
  navigation: n,
}: {
  workbench: WorkbenchState;
  navigation: WorkspaceNavigator;
}) {
  const [compact, setCompact] = useState(() => {
      try {
        return localStorage.getItem("glb-viewer:navigation-compact") === "true";
      } catch {
        return false;
      }
    }),
    nav = useRef<HTMLElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem("glb-viewer:navigation-compact", String(compact));
    } catch {}
  }, [compact]);
  return (
    <aside
      className={`workspace-sidebar ${compact ? "is-compact" : ""}`}
      aria-label="Workspace navigation"
    >
      <ScrollArea className="min-h-0 flex-1">
        <nav
          ref={nav}
          aria-label="Asset tools"
          className="workspace-sidebar-pages"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            const buttons = Array.from(
                nav.current?.querySelectorAll<HTMLButtonElement>(
                  "[data-tab]",
                ) || [],
              ),
              index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
            if (index < 0) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }}
        >
          {workspaceSections.map((section) => (
            <section
              key={section.id}
              className="workspace-nav-group"
              aria-label={section.label}
              data-section={section.id}
            >
              <h2>{section.label}</h2>
              {section.pages.map((page) => {
                const Icon = icons[page.id],
                  active = n.page === page.id;
                return (
                  <Tooltip key={page.id}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={active ? "secondary" : "ghost"}
                        className="workspace-nav-item"
                        data-tab={page.id}
                        data-state={active ? "active" : "inactive"}
                        id={
                          page.id === "textures"
                            ? "texture-workbench"
                            : undefined
                        }
                        aria-current={active ? "page" : undefined}
                        aria-label={page.label}
                        tabIndex={active ? 0 : -1}
                        onClick={() => n.navigate(page.id)}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        <span className="workspace-nav-label">
                          {page.label}
                        </span>
                        {page.id === "textures" && (
                          <span id="wb-count" className="workspace-nav-count">
                            {w.analysis?.textures.length ?? 0}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    {compact && (
                      <TooltipContent side="right">{page.label}</TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </section>
          ))}
        </nav>
      </ScrollArea>
      <div className="workspace-sidebar-footer">
        {w.source && <WatchControl workbench={w} compact={compact} fullLabel />}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              id="toggle-navigation"
              variant="ghost"
              size="sm"
              aria-label={compact ? "Expand navigation" : "Collapse navigation"}
              aria-expanded={!compact}
              onClick={() => setCompact((value) => !value)}
            >
              {compact ? (
                <PanelLeftOpen className="size-3.5" />
              ) : (
                <PanelLeftClose className="size-3.5" />
              )}
              <span className="workspace-nav-label">Collapse</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {compact ? "Expand navigation" : "Collapse navigation"}
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
