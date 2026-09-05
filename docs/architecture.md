# Architecture

The service has five small parts.

```text
Cloudflare Access JWT
        |
        v
authentication -> MCP request decoding -> plan service -> Drizzle Effect adapter -> SQLite
                                             |
                                             v
                                 focused packet assembly
```

- `src/contract` defines contract `v1` with Effect Schema and public error codes.
- `src/auth` verifies JWT signature, issuer, audience, and expiry, then resolves an operator-managed credential mapping. MCP requests accept service mappings only. Browser mappings use the same owner records but remain a separate credential kind.
- `src/domain` validates complete plans and assembles selected packets. Packet digests include the selected item and required context, decisions, and asset descriptors. The compact epic index is returned but does not affect that digest.
- `src/database` defines owner-scoped Drizzle tables. Every plan child includes `owner_id`, and every query includes it. Current normalized records support direct constraints and later UI work. `plan_revisions` keeps each accepted full document, while `operations` makes a retried write return its original result.
- `src/mcp` implements authenticated stateless JSON-RPC over `POST /mcp`. Stable `irudd-plan://` resources always resolve current content.

The future private React review app belongs under `src/web`. The current React page only reports that the service is running and links to health checks. It never exposes plan IDs or content.

SQLite uses WAL and a five-second busy timeout through `@effect/sql-sqlite-node`. Each plan write runs in one immediate transaction. Two requests that start at the same expected version serialize at SQLite's write lock. The first commit advances the version, and the second returns `PLAN_CONFLICT` before changing current records or adding a revision.

Repository metadata starts unverified. This release has no publish operation. GitHub verification and public reads belong to later work.
