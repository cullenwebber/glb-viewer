import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { workspaceSections } from "@/lib/workspace-navigation";
import type { WorkspaceNavigator } from "@/hooks/use-workspace-navigation";
export function WorkspaceSections({
  navigation: n,
}: {
  navigation: WorkspaceNavigator;
}) {
  return (
    <Tabs
      className="workspace-sections"
      value={n.section.id}
      onValueChange={n.selectSection}
    >
      <TabsList variant="line" aria-label="Workspace sections">
        {workspaceSections.map((section) => (
          <TabsTrigger
            key={section.id}
            data-section={section.id}
            value={section.id}
          >
            {section.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
