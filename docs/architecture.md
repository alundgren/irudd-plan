# Architecture

The service has a private MCP interface and a private browser review interface.

```text
Cloudflare Access service JWT -> MCP tools ----+
                                               |
Cloudflare Access browser JWT -> browser API --+-> plan service -> SQLite
                                               |         |
                                               |         +-> commit-only update notices
                                               |
                                               +-> immutable asset reads
```

- `src/contract` defines contract `v1` with Effect Schema and public error codes.
- `src/auth` verifies JWT signature, issuer, audience, and expiry, then resolves an operator-managed credential mapping. MCP requests accept service mappings only. Browser mappings use the same owner records but remain a separate credential kind.
- `src/domain` validates complete plans and assembles selected packets. It also validates immutable uploads and publishes revision cursors after successful commits. Packet digests include the selected item and required context, decisions, and asset descriptors. The compact epic index is returned but does not affect that digest.
- `src/database` defines owner-scoped Drizzle tables. Every plan child includes `owner_id`, and every query includes it. The current normalized records keep stable IDs and compact index metadata. The current `plan_revisions.content_json` document is authoritative for packet reads, and earlier rows retain accepted revisions. `asset_objects` retains each uploaded digest and optional editable source. `operations` makes a retried write return its original result.
- `src/mcp` implements authenticated stateless JSON-RPC over `POST /mcp`. Stable `irudd-plan://` resources always resolve current content.
- `src/web` contains the React Flow review application and its owner-authenticated JSON, asset, and event routes. Event payloads contain only a revision number. Each delivery verifies the original browser credential again before writing to the stream. Interactive asset scripts run in a hardened SES Worker compartment with a small virtual document API; the visible iframe does not execute uploaded JavaScript.

The client is built separately into `dist/client`, while the server remains the Node SSR build in `dist/main.js`. The Node service serves both outputs.

SQLite uses WAL and a five-second busy timeout through `@effect/sql-sqlite-node`. Each plan write runs in one immediate transaction. Two requests that start at the same expected version serialize at SQLite's write lock. The first commit advances the version, and the second returns `PLAN_CONFLICT` before changing current records or adding a revision.

Repository metadata starts unverified. This release has no publish operation. GitHub verification and public reads belong to later work.
