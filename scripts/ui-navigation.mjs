import { sectionForPage } from "../src/lib/workspace-navigation.ts";
export async function openWorkspace(page, tab) {
  const section = sectionForPage(tab);
  await page.locator(`[data-section="${section.id}"]`).click();
  await page.locator(`[data-tab="${tab}"]`).click();
}
export async function openUpdates(page) {
  await page.locator("#app-menu").click();
  await page.locator("#app-updates").click();
}
