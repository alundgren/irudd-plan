import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";

import { renderAppPage } from "../src/web/operator-page.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

it("uses the current build manifest for private and public client URLs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "plan-client-"));
  directories.push(directory);
  await mkdir(join(directory, ".vite"));
  const manifestPath = join(directory, ".vite/manifest.json");
  const manifest = {
    "src/web/client.tsx": {
      file: "assets/client-first123.js",
      css: ["assets/client-first123.css"],
      imports: ["shared"],
    },
    shared: {
      file: "assets/shared-12345678.js",
      css: ["assets/shared-12345678.css"],
    },
  };
  await writeFile(manifestPath, JSON.stringify(manifest));
  const assets = join(directory, "assets");
  const html = await renderAppPage(assets);
  expect(html).toContain('src="/assets/client-first123.js"');
  expect(html).toContain('href="/assets/client-first123.css"');
  expect(html).toContain('href="/assets/shared-12345678.css"');
  const publicHtml = await renderAppPage(assets, true);
  expect(publicHtml).toContain('src="/public/assets/client-first123.js"');
  expect(publicHtml).toContain('href="/public/assets/shared-12345678.css"');
  manifest["src/web/client.tsx"].file = "assets/client-next1234.js";
  await writeFile(manifestPath, JSON.stringify(manifest));
  const updated = await renderAppPage(assets);
  expect(updated).toContain('src="/assets/client-next1234.js"');
  expect(updated).not.toContain("client-first123.js");
});
