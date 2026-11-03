import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WatchControl } from "./WatchControl";
import type { WorkbenchState } from "@/hooks/use-workbench";
import type { WorkspaceNavigator } from "@/hooks/use-workspace-navigation";
export function WorkspaceNavigation({
  workbench: w,
  navigation: n,
}: {
  workbench: WorkbenchState;
  navigation: WorkspaceNavigator;
}) {
  return (
    <nav className="workspace-navigation" aria-label="Asset workspace">
      <Tabs value={n.page} onValueChange={n.navigate}>
        <TabsList
          variant="line"
          className="workspace-tabs"
          aria-label={`${n.section.label} pages`}
        >
          {n.section.pages.map((page) => (
            <TabsTrigger
              key={page.id}
              value={page.id}
              data-tab={page.id}
              id={page.id === "textures" ? "texture-workbench" : undefined}
            >
              {page.label}
              {page.id === "textures" && (
                <span id="wb-count" className="tab-count">
                  {w.analysis?.textures.length ?? 0}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="workspace-tools">
        {w.source && <WatchControl workbench={w} />}
      </div>
    </nav>
  );
}
