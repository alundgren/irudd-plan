import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Manifest } from "vite-plus";
import { renderToStaticMarkup } from "react-dom/server";

function AppPage({
  script,
  styles,
}: {
  readonly script: string;
  readonly styles: readonly string[];
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>irudd plan review</title>
        {styles.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body>
        <div id="root" />
        <script type="module" src={script} />
      </body>
    </html>
  );
}

export async function renderAppPage(
  directory: string,
  publicAssets = false,
): Promise<string> {
  const manifest = JSON.parse(
    await readFile(join(directory, "../.vite/manifest.json"), "utf8"),
  ) as Manifest;
  const entry = manifest["src/web/client.tsx"];
  if (entry === undefined)
    throw new Error("Browser build manifest has no client entry");
  const prefix = publicAssets ? "/public/" : "/";
  const styles = new Set<string>();
  const visited = new Set<string>();
  function collectStyles(key: string): void {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (chunk === undefined)
      throw new Error("Browser build manifest has a missing import");
    for (const css of chunk.css ?? []) styles.add(`${prefix}${css}`);
    for (const imported of chunk.imports ?? []) collectStyles(imported);
  }
  collectStyles("src/web/client.tsx");
  return `<!doctype html>${renderToStaticMarkup(<AppPage script={`${prefix}${entry.file}`} styles={[...styles]} />)}`;
}
