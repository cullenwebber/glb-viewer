import { sectionForPage } from "@/lib/workspace-navigation";
import type { WorkbenchState } from "./use-workbench";
export function useWorkspaceNavigation(w: WorkbenchState) {
  const page = w.open || w.tab === "performance" ? w.tab : "model";
  function navigate(next: string) {
    w.setTab(next);
    w.setOpen(next !== "model" && next !== "performance");
  }
  return { page, section: sectionForPage(page), navigate };
}
export type WorkspaceNavigator = ReturnType<typeof useWorkspaceNavigation>;
