import { renderToStaticMarkup } from "react-dom/server";

function AppPage({ publicAssets }: { readonly publicAssets: boolean }) {
  const assetPrefix = publicAssets ? "/public/assets" : "/assets";
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>irudd plan review</title>
        <link rel="stylesheet" href={`${assetPrefix}/app.css`} />
      </head>
      <body>
        <div id="root" />
        <script type="module" src={`${assetPrefix}/app.js`} />
      </body>
    </html>
  );
}

export function renderAppPage(publicAssets = false): string {
  return `<!doctype html>${renderToStaticMarkup(<AppPage publicAssets={publicAssets} />)}`;
}
