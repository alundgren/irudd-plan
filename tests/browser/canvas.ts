import { expect, type Locator, type Page } from "@playwright/test";

export async function panTo(page: Page, target: Locator) {
  const canvas = await page.locator(".react-flow").boundingBox();
  const bounds = await target.boundingBox();
  if (canvas === null || bounds === null)
    throw new Error("Missing canvas content");
  const top = canvas.y + 100;
  await page.mouse.move(canvas.x + 8, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, (bounds.y - top) * 2);
  await expect
    .poll(async () => (await target.boundingBox())?.y)
    .toBeCloseTo(top, 0);
}
