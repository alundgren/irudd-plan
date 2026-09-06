# Developing the service

Use `vp install --frozen-lockfile`, `vp run check`, `vp run test` and
`vp run build`. The committed lockfile and exact pins are the supported
combination. Do not substitute Effect 3 or the ordinary Drizzle latest tag.

| Component                          | Exact version      |
| ---------------------------------- | ------------------ |
| Effect and @effect/sql-sqlite-node | 4.0.0-rc.112       |
| drizzle-orm                        | 1.0.0-rc.5-169397b |
| drizzle-kit                        | 1.0.0-rc.5-ab785fc |
| MCP client/server/node SDK         | 2.0.0              |
| Vite+                              | 0.3.0              |
| Node.js                            | 24.20.0            |
| pnpm                               | 11.25.0            |
| TypeScript                         | 7.0.2              |

Run `vp run example:database` for the small verified
[Effect/Drizzle example](../scripts/effect-drizzle-example.ts). It creates an
in-memory SQLite table, inserts a parameterized value, reads it through the
Effect 4 Drizzle adapter and asserts the returned value. The scoped SQLite
layer closes when the effect finishes. Production uses the same adapter with
committed migrations and file-backed storage in `src/database/store.ts`.
Generate migrations with `vp run db:generate --name <semantic_name>`.

Install the [public skill](../skills/irudd-plan/SKILL.md) with
`vp run skill:install`. Its complete instructions and examples are copied
alongside SKILL.md. See [smoke tests](smoke-tests.md) for client and fresh-session
validation; syntax validation of the skill alone proves no integration behavior.
