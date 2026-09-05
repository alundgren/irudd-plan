# irudd-plan

`irudd-plan` stores private, versioned work-item plans and returns one focused implementation packet through authenticated MCP. It does not run agents, schedule issues, or decide whether work is approved.

The current release implements contract `v1` over MCP `2026-07-28`. Plan data stays in SQLite under the owner resolved from a verified Cloudflare Access identity.

## Run it locally

Install Node `24.20.0` and pnpm `11.25.0`, then run:

```bash
pnpm install --frozen-lockfile
cp .env.example .env
# Replace every placeholder in .env, then load it into your shell.
set -a
. ./.env
set +a
pnpm dev
```

Production startup requires a valid issuer, audience, JWKS URL, and at least one service identity mapping. There is no environment flag that disables authentication. Tests inject a verifier in process and never change production startup behavior.

Create the example plan and retrieve its first item with an Access application token:

```bash
IRUDD_MCP_URL=http://127.0.0.1:3000/mcp \
CF_ACCESS_TOKEN='<signed-access-jwt>' \
pnpm example:mcp
```

The example client negotiates `2026-07-28`, calls `write_plan`, then calls `get_work_item`. Run it again with a different plan ID, or update `scripts/mcp-example.ts` to pass the returned version as `expectedVersion` for a revision.

## Checks

```bash
pnpm check
pnpm test
pnpm build
pnpm db:generate
```

`pnpm check` uses Vite+ for formatting, linting, and TypeScript. `pnpm test` uses the Vitest release bundled with the pinned Vite+ toolchain.

See [the MCP contract](docs/mcp.md), [architecture](docs/architecture.md), and [operations](docs/operations.md) for the public API and deployment details.

## Version record

Compatibility was checked on 2026-09-05. Effect's current `rc` tag is `4.0.0-rc.112`, and `@effect/sql-sqlite-node` has the same tag. This repository pins both at that version. Drizzle's ordinary latest release still belongs to the Effect 3 generation. The tested Effect 4 adapter combination is pinned to `drizzle-orm@1.0.0-rc.5-169397b` and `drizzle-kit@1.0.0-rc.5-ab785fc`, with no range specifiers.

Vite+ is pinned at `0.3.0`, Node at `24.20.0`, pnpm at `11.25.0`, and the lockfile is committed. The official MCP TypeScript SDK `1.30.0` still declares `2025-11-25` as its stable protocol version. The HTTP implementation in this repository therefore validates the published `2026-07-28` messages directly. `src/client/mcp-client.ts` and the integration test exercise the exact version without claiming compatibility with the older SDK transport.
