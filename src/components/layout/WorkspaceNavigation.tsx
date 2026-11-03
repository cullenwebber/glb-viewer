import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkbenchState } from "@/hooks/use-workbench";
export function WorkspaceNavigation({
  workbench: w,
}: {
  workbench: WorkbenchState;
}) {
  return (
    <nav className="workspace-navigation" aria-label="Asset workspace">
      <Tabs
        value={
          w.tab === "performance" ? "performance" : w.open ? w.tab : "model"
        }
        onValueChange={(value) => {
          if (value === "model" || value === "performance") {
            w.setTab(value);
            w.setOpen(false);
          } else {
            w.setTab(value);
            w.setOpen(true);
          }
        }}
      >
        <TabsList variant="line" className="workspace-tabs">
          <TabsTrigger value="model">Model</TabsTrigger>
          <TabsTrigger
            id="texture-workbench"
            data-tab="textures"
            value="textures"
          >
            Textures
            <span id="wb-count" className="tab-count">
              {w.analysis?.textures.length ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger data-tab="packing" value="packing">
            Channel packing
          </TabsTrigger>
          <TabsTrigger data-tab="geometry" value="geometry">
            Geometry
          </TabsTrigger>
          <TabsTrigger data-tab="checks" value="checks">
            Checks
          </TabsTrigger>
          <TabsTrigger data-tab="performance" value="performance">
            Performance
          </TabsTrigger>
          <TabsTrigger data-tab="compare" value="compare">
            Compare
          </TabsTrigger>
          <TabsTrigger data-tab="report" value="report">
            Size report
          </TabsTrigger>
          <TabsTrigger data-tab="presets" value="presets">
            Presets
          </TabsTrigger>
          <TabsTrigger data-tab="history" value="history">
            History
          </TabsTrigger>
          <TabsTrigger data-tab="budgets" value="budgets">
            Budgets
          </TabsTrigger>
          <TabsTrigger data-tab="batch" value="batch">
            Batch
          </TabsTrigger>
          <TabsTrigger data-tab="export" value="export">
            Export
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <span className="workspace-local">Local workspace</span>
    </nav>
  );
}
