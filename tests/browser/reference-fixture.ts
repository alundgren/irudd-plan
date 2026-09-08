import { expect, type Page } from "@playwright/test";
import type { AssetDescriptor, Plan } from "../../src/contract/plan.js";

export const caption = "Decision guide";
export const originalDigest = `sha256:${"a".repeat(64)}`;
export const replacementDigest = `sha256:${"b".repeat(64)}`;

export async function referenceFixture(page: Page) {
  const initial = await page.request.get("/api/plans/browser-plan");
  const initialVersion = ((await initial.json()) as { version: number })
    .version;
  let version = initialVersion;
  let removed = false;
  await page.route("**/api/plans/browser-plan", async (route) => {
    const response = await route.fetch();
    const document = (await response.json()) as { plan: Plan };
    const descriptor = (
      id: string,
      mediaType: string,
      text: string,
    ): AssetDescriptor => ({
      id,
      mediaType,
      caption:
        id === "guide" && version > initialVersion
          ? `${text}. ${"Explain every branch of the review decision, including when evidence is missing. ".repeat(35)}`
          : text,
      uri: `asset:${id}`,
      role: "binding-reference",
      digest:
        id === "guide" && version > initialVersion
          ? replacementDigest
          : originalDigest,
      available: id !== "missing",
    });
    const assets = [
      descriptor("guide", "image/svg+xml", caption),
      descriptor("wide", "image/svg+xml", "Wide overview"),
      {
        ...document.plan.assets.find((asset) => asset.id === "asset-image")!,
        caption: "Raster reference",
      },
      descriptor("html", "text/html", "Interactive document"),
      descriptor("missing", "image/svg+xml", "Missing drawing"),
      descriptor("unsupported", "application/pdf", "Unsupported drawing"),
      descriptor("failed", "image/png", "Failed image request"),
    ];
    await route.fulfill({
      json: {
        ...document,
        version,
        plan: {
          ...document.plan,
          assets,
          items: document.plan.items.map((item, index) => ({
            ...item,
            requiredContextIds: [],
            requiredDecisionIds: [],
            requiredAssetIds:
              index === 0
                ? assets
                    .map((asset) => asset.id)
                    .filter((id) => !removed || id !== "guide")
                : index === 1
                  ? ["guide"]
                  : [],
          })),
        },
      },
    });
  });
  await page.route("**/api/plans/browser-plan/assets/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    if (id === "asset-image") return route.continue();
    if (id === "failed") return route.fulfill({ status: 404 });
    const content =
      id === "html"
        ? `<!doctype html><html><head><style>body{margin:0;font:16px system-ui}main{height:850px;background:#EADFCD}button{padding:16px}</style></head><body><main>Document top</main><button id="grow">Show detail</button><p id="detail"></p><script>document.querySelector('#grow').onclick = () => {document.querySelector('#detail').textContent = 'The detail is now visible.';};</script></body></html>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${id === "wide" ? "1200 300" : "800 1600"}"><rect width="100%" height="100%" fill="#EADFCD"/><text x="40" y="80" font-size="40">${version > initialVersion ? "Revised" : "Original"} guide</text><text x="40" y="1500" font-size="40">Drawing bottom</text></svg>`;
    await route.fulfill({
      json: { bytesBase64: Buffer.from(content).toString("base64") },
    });
  });
  return {
    async update(remove = false) {
      version += 1;
      removed = remove;
      await page.evaluate(() => {
        window.dispatchEvent(new Event("offline"));
        window.dispatchEvent(new Event("online"));
      });
      await expect(page.locator(".review-app")).toHaveAttribute(
        "data-version",
        String(version),
      );
    },
  };
}
