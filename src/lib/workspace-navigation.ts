export const workspaceSections = [
  {
    id: "inspect",
    label: "Inspect",
    pages: [
      { id: "model", label: "Model" },
      { id: "textures", label: "Textures" },
      { id: "checks", label: "Checks" },
      { id: "performance", label: "Performance" },
    ],
  },
  {
    id: "optimize",
    label: "Optimize",
    pages: [
      { id: "geometry", label: "Geometry" },
      { id: "packing", label: "Channel packing" },
      { id: "presets", label: "Presets" },
    ],
  },
  {
    id: "review",
    label: "Review",
    pages: [
      { id: "compare", label: "Compare" },
      { id: "report", label: "Size report" },
      { id: "history", label: "History" },
      { id: "export", label: "Export" },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    pages: [
      { id: "batch", label: "Batch processing" },
      { id: "budgets", label: "Project budgets" },
    ],
  },
] as const;
export function sectionForPage(page: string) {
  return (
    workspaceSections.find((section) =>
      section.pages.some((item) => item.id === page),
    ) || workspaceSections[0]
  );
}
