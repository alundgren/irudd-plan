# irudd-plan

`irudd-plan` stores private, versioned work-item plans, returns focused implementation packets through authenticated MCP, and presents current plans in a read-only canvas for human review. It does not run agents, schedule issues, edit plan content in the browser, or decide whether work is approved.

The current release implements contract `v1` over MCP `2026-07-28`. Plan data stays in SQLite under the owner resolved from a verified Cloudflare Access identity.

## Use with Codex

Install the self-contained [irudd-plan skill](skills/irudd-plan/SKILL.md) with
`bash scripts/install-skill.sh`. Follow its [Codex setup](skills/irudd-plan/references/setup.md),
then run the [client and browser smoke checks](docs/smoke-tests.md). The required
MCP integration stops work on unavailable requirements or assets.

See [development](docs/development.md) for exact dependency constraints and the
runnable Effect 4/Drizzle example.

## Run it locally

Install Vite+ and the project dependencies:

```sh
curl -fsSL https://vite.plus | bash
vp install --frozen-lockfile
```

Vite+ installs the required Node.js runtime and the pinned pnpm release. Open a
new shell if the installer adds `vp` to your path but the current shell cannot
find it.

Configure and start the service:

```sh
cp .env.example .env
# Replace every placeholder in .env, then load it into your shell.
set -a
. ./.env
set +a
vp run dev
```

Production startup requires a valid issuer, audience, JWKS URL, and at least one service identity mapping. There is no environment flag that disables authentication. Tests inject a verifier in process and never change production startup behavior.

This direct JWT development example uses an Access application token; the supported Codex setup uses the two Cloudflare service-token headers described in [Codex setup](skills/irudd-plan/references/setup.md).

Create the example plan and retrieve its first item:

```sh
IRUDD_MCP_URL=http://127.0.0.1:3000/mcp \
CF_ACCESS_TOKEN='<signed-access-jwt>' \
vp run example:mcp
```

The example client negotiates `2026-07-28`, calls `write_plan`, then calls `get_work_item`. Run it again with a different plan ID, or update `scripts/mcp-example.ts` to pass the returned version as `expectedVersion` for a revision.

## Checks

```sh
vp run check
vp run test
vp run test:browser
vp run build
vp run db:generate --name <semantic_name>
```

`vp run check` reports advisory warnings for files over 500 lines, functions
over 100 lines, and functions with cyclomatic complexity over 20. Automation
uses `vp run check:ci` to hide those warnings while retaining format, lint, and
type failures.

Use `vp install` or `vp i` to install dependencies, `vp add` and `vp remove` to
change them, `vp exec` for project binaries, and `vp node` for direct Node.js
entry points. These commands keep Node.js and pnpm on the versions declared by
this repository.

See [the review interface](ux.md), [MCP contract](docs/mcp.md), [architecture](docs/architecture.md), and [operations](docs/operations.md) for browser review, GitHub linking, publication, and deployment details.

## Version record

Compatibility was checked on 2026-09-05. Effect's current `rc` tag is `4.0.0-rc.112`, and `@effect/sql-sqlite-node` has the same tag. This repository pins both at that version. Drizzle's ordinary latest release still belongs to the Effect 3 generation. The tested Effect 4 adapter combination is pinned to `drizzle-orm@1.0.0-rc.5-169397b` and `drizzle-kit@1.0.0-rc.5-ab785fc`, with no range specifiers.

Vite+ is pinned at `0.3.0`, Node at `24.20.0`, pnpm at `11.25.0`, and the lockfile is committed. The server, example client, and integration tests pin the official MCP TypeScript SDK packages at `2.0.0` and select protocol `2026-07-28` explicitly.
