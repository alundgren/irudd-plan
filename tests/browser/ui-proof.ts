import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page, TestInfo } from "@playwright/test";

export async function recordProof(
  page: Page,
  info: TestInfo,
  name: string,
  exercise: () => Promise<void>,
) {
  if (process.env.UI_PROOF !== "1") return exercise();
  const directory = join("test-results", "ui-proof");
  await mkdir(directory, { recursive: true });
  const video = join(directory, `${name}.webm`);
  await page.screencast.start({
    path: video,
    size: { width: 1280, height: 800 },
  });
  await page.screencast.showActions({ position: "bottom-right", fontSize: 16 });
  try {
    await exercise();
    const screenshot = join(directory, `${name}.png`);
    await page.screenshot({ path: screenshot });
    await info.attach(name, { path: screenshot, contentType: "image/png" });
  } finally {
    await page.screencast.stop();
  }
  await info.attach(name, { path: video, contentType: "video/webm" });
}

export async function captureProofStill(page: Page, name: string) {
  if (process.env.UI_PROOF !== "1") return;
  await mkdir("test-results/ui-proof", { recursive: true });
  await page.screenshot({ path: join("test-results/ui-proof", `${name}.png`) });
}
