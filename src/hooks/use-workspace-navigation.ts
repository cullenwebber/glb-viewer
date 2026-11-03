import { useRef } from "react";
import { sectionForPage, workspaceSections } from "@/lib/workspace-navigation";
import type { WorkbenchState } from "./use-workbench";
export function useWorkspaceNavigation(w: WorkbenchState) {
  const lastPages = useRef<Record<string, string>>({});
  const page = w.open || w.tab === "performance" ? w.tab : "model";
  const section = sectionForPage(page);
  lastPages.current[section.id] = page;
  function navigate(next: string) {
    w.setTab(next);
    w.setOpen(next !== "model" && next !== "performance");
  }
  function selectSection(id: string) {
    const next = workspaceSections.find((section) => section.id === id);
    if (next) navigate(lastPages.current[id] || next.pages[0].id);
  }
  return { page, section, navigate, selectSection };
}
export type WorkspaceNavigator = ReturnType<typeof useWorkspaceNavigation>;
