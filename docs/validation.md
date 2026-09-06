# Local validation record

Observed on 2026-09-06 with Codex CLI 0.153.4, Node.js 24.20.0 and the pinned
repository dependencies. These are local results, not a Cloudflare/Pi deployment
certificate. Reproduce them using [smoke-tests.md](smoke-tests.md).

- `vp run check` and `vp run check:ci`: format, lint and types pass. Advisory
  length/complexity warnings remain in existing storage/service code and long
  end-to-end test scenarios. The handoff and browser loop scenarios remain
  contiguous so the write/read/failure sequence can be reviewed together.
- `vp run test`: 57 tests across 12 files pass, including the strict client
  handoff tests, signed JWT checks, stale writes and owner isolation.
- `vp run test:browser`: all 14 browser tests pass.
- `vp run smoke:browser`: the local private/public feedback and MCP revision
  loop passes, including a context with explicitly empty credentials and
  offline/reconnect checks.
- `vp run example:database`: the Effect 4/Drizzle SQLite round trip passes.
- A clean source copy with no dependencies installed completed frozen-lockfile
  installation, the database example, public skill installation and both builds.
  The shell `.env.example` parses through the production configuration loader.
- The public skill passes the skill frontmatter validator. Its installer copies
  all references and refuses to replace an existing destination.

## Fresh Codex sessions

Each final trial used a temporary workspace, the public skill, a disposable MCP
service, explicitly disabled user skill folders, and no project guidance. The
CLI's configured MCP used an environment-backed header and required modern
startup. All recorded successful requests carried `2026-07-28`.

| Trial                  | Observed result                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning               | Wrote a ten-item proposal as revision 1, deliberately read the full plan, revised item 1 at revision 2, and recorded agreement only for the requested greeting decision. Retrieved the selected packet and optional context, decoded and verified the required PNG, and described its orange/teal circles and line. |
| Selected change        | Retrieved the original Hello requirement, detected a changed packet at completion, retrieved the revised selected item, implemented Welcome, and finished with an unchanged check. Independent execution of its generated Python function returned `Welcome, Ada.`. No full-plan or sibling read occurred.          |
| Unrelated change       | Retrieved one selected packet, deliberately read optional context and inspected the PNG. A sibling changed, the selected packet check remained unchanged, and its generated Python function independently returned `Hello, Ada.`. No full-plan or sibling read occurred.                                            |
| Missing required asset | `get_asset` returned ASSET_UNAVAILABLE. The agent stopped, named restoring required bytes as the repair, and wrote no implementation.                                                                                                                                                                               |
| Server unavailable     | The required server failed discovery. CLI exited 1 before task execution, made no successful MCP requests and produced no implementation.                                                                                                                                                                           |

The planning session also ran plain `codex features list`, which reports saved
settings and omitted the launching process's feature override. It conservatively
reported that setup check as unverified. The recorded MCP requests establish
actual negotiation. Setup guidance now explains how to apply the same override
when listing features. Browser visibility was checked by the browser suite,
not inferred from that planning session's successful writes.

Initial trial attempts stopped at MCP approval configuration or included the
host writing skill. They were excluded from the self-contained evidence and
repeated with trial-only `approve` mode and explicit user-skill disabling.

## Still requires the deployed endpoint

Actual Cloudflare Service Auth rejection/expiry, Access application audiences,
email/PIN browser login, tunnel behavior, real GitHub App permissions, ARM64 Pi
runtime and volume restart durability must be observed during commissioning in
issue #5. The supplied `smoke:mcp` and remote `smoke:browser` commands cover that
path. No remote deployment, GitHub test artifact creation, or paid service setup
was performed for this local validation.
