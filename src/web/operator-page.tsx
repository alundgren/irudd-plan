import { renderToStaticMarkup } from "react-dom/server";

function OperatorPage() {
  return (
    <main>
      <h1>irudd-plan</h1>
      <p>The plan service is running.</p>
      <p>
        Agents retrieve plan content through the authenticated MCP endpoint.
      </p>
      <nav aria-label="Service checks">
        <a href="/healthz">Health</a> <a href="/readyz">Readiness</a>
      </nav>
    </main>
  );
}

export function renderOperatorPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>irudd-plan</title></head><body>${renderToStaticMarkup(<OperatorPage />)}</body></html>`;
}
