import { expect, type Locator, type Page } from "@playwright/test";

export async function panTo(page: Page, target: Locator) {
  await page.locator(".plan-viewport").waitFor({ state: "visible" });
  await page.locator(".overview-index-disclosure").evaluateAll((elements) =>
    elements.forEach((element) => {
      (element as HTMLDetailsElement).open = true;
    }),
  );
  await target.evaluate((element) => {
    const details = element.closest("details");
    if (details) details.open = true;
  });
  const bounds = await target.boundingBox();
  const canvas = await page.locator(".plan-viewport").boundingBox();
  if (bounds === null || canvas === null)
    throw new Error("Missing canvas content");
  await page.locator(".plan-viewport").evaluate(
    (view, delta) => {
      view.scrollTop += delta;
    },
    bounds.y - canvas.y - 100,
  );
  if (
    !(await target.evaluate((el) =>
      el.classList.contains("feedback-target-control"),
    ))
  )
    await expect(target).toBeInViewport();
}
export async function openReference(page: Page, caption: string) {
  const link = page
    .locator(".item-sheet.selected")
    .getByRole("button", { name: caption, exact: true });
  await panTo(page, link);
  await link.click();
  await expect(page.locator(".reference-sheet.selected")).toBeInViewport();
}
