import { renderToStaticMarkup } from "react-dom/server";

function AppPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>irudd plan review</title>
        <link rel="stylesheet" href="/assets/app.css" />
      </head>
      <body>
        <div id="root" />
        <script type="module" src="/assets/app.js" />
      </body>
    </html>
  );
}

export function renderAppPage(): string {
  return `<!doctype html>${renderToStaticMarkup(<AppPage />)}`;
}
