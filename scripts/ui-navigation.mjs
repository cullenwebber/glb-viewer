export async function openWorkspace(page, tab) {
  await page.locator(`[data-tab="${tab}"]`).click();
}
export async function openUpdates(page) {
  await page.locator("#app-menu").click();
  await page.locator("#app-updates").click();
}
