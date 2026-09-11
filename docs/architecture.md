# Architecture

The service has an authenticated MCP interface, a private browser review
interface, and narrow anonymous reads for published plans.

```text
Cloudflare Access service JWT -> MCP tools ----+
                                               |
Cloudflare Access browser JWT -> browser API --+-> plan service -> SQLite
                                               |         |
                                               |         +-> commit-only update notices
                                               |
                                               +-> immutable asset reads

Anonymous request -> /public/* -> publication check -> current plan/assets/events

GitHub App installation token -> repository and issue/PR reads -> verification records
```

- `src/contract` defines contract `v1` with Effect Schema and public error codes.
- `src/auth` verifies JWT signature, issuer, audience, and expiry, then resolves an operator-managed credential mapping. MCP requests accept service mappings only. Browser mappings use the same owner records but remain a separate credential kind.
- `src/domain` validates complete plans and assembles selected packets. It also validates immutable uploads and publishes revision cursors after successful commits. Packet digests include the selected item and required context, decisions, and asset descriptors. The compact epic index is returned but does not affect that digest.
- `src/database` defines owner-scoped Drizzle tables. Every plan child includes `owner_id`, and every query includes it. The current normalized records keep stable IDs and compact index metadata. The current `plan_revisions.content_json` document is authoritative for packet reads, and earlier rows retain accepted revisions. `asset_objects` retains each uploaded digest and optional editable source. `operations` makes a retried write return its original result.
- `src/mcp` implements authenticated stateless JSON-RPC over `POST /mcp`. Stable `irudd-plan://` resources always resolve current content.
- `src/web` contains the React Flow review application and its owner-authenticated JSON, asset, and event routes. Event payloads contain only a revision number. Each delivery verifies the original browser credential again before writing to the stream. Interactive asset scripts run in a hardened SES Worker compartment with a small virtual document API; the visible iframe does not execute uploaded JavaScript.

The client is built separately into `dist/client`, while the server remains the Node SSR build in `dist/main.js`. The Node service serves both outputs.

SQLite uses WAL and a five-second busy timeout through `@effect/sql-sqlite-node`. Each plan write runs in one immediate transaction. Two requests that start at the same expected version serialize at SQLite's write lock. The first commit advances the version, and the second returns `PLAN_CONFLICT` before changing current records or adding a revision.

Repository metadata starts unverified. An operator maps each internal owner to
specific GitHub App installations and repositories. The service uses short-lived
installation tokens to verify the canonical repository ID and visibility before
it accepts work links. A separate MCP action publishes verified public-repository
plans. Published reads resolve the current revision through `/public/*`; private
and unpublished records still require Cloudflare Access.

`PlanRetention` checks persisted GitHub associations through the same read-only
GitHub connection used for attachment. `RetentionStore` selects due plans and
commits retention decisions against a saved mutation counter. Plan writes,
repository updates and attachments advance that counter, preventing deletion
based on an outdated verification. Final cleanup and deleted-ID reservation
share one SQLite transaction. The server resumes due batches after restart.

## Planning conversation

`planning_entries` stores an append-only private discussion per owner and plan.
Each entry has a stable ID, author, ordered revision, section, text and optional
question reply or immutable visual descriptors. A batch transaction validates
its expected conversation revision and stores its idempotency receipt with the
entries. Plan deletion cascades to discussion entries. The existing plan
retention policy also governs conversation lifetime.

MCP `append_planning` creates agent questions, notes and resolutions. The
browser's authenticated JSON endpoint creates human answers and notes, with
cross-origin submission protection. `get_planning` supports a revision/digest cursor
for active agent polling. The browser receives private conversation events and fetches changed pages.
The optional local queue companion subscribes using service credentials and
forwards new human batches through `codex queue`; the web server never launches
a local agent process.

MCP `patch_plan` reconstructs a specification from the exact stored base revision
and complete changed records, then uses ordinary validation and optimistic write
transactions. Retrying the original delta returns its receipt even after later
edits. Conversation entries never enter plan JSON or packet digests. Public
asset access still requires membership in the published specification.

Specification synchronization compares the selected stored base and target
revisions and sends only changed records, removed IDs and changed ordering.
Continuation tokens pin both revisions so concurrent edits cannot mix pages.
Conversation synchronization hashes a chain of persisted entries. Every normal
read includes the last verified cursor; missing or divergent cursors trigger
explicit recovery through bounded pages. Cursors are stateless, with no session
registry or additional infrastructure. `get_operation` reads an owner-scoped
receipt to resolve uncertain writes without retransmitting their content.

## Agent context

`agent_context_entries` stores immutable owner/plan-scoped findings separately
from discussion and specification. Each record has a title, body and optional
`supersedes` ID identifying an explicit correction. Its independent digest chain
supports bounded `get_agent_context` reads and optimistic `append_agent_context`
writes with operation receipts. Exact source retrieval uses a primary-key lookup.
Plan deletion cascades to these records; publishing a plan does not expose them.

The browser only retrieves agent context when a conversation entry explicitly
cites a source and the person opens it. It has no context-write endpoint. Existing
conversation rows and digest chains remain unchanged. Requirements needed for
implementation must enter work items or required specification records, because
agent context is excluded from item packets and their digests.

Each planning composer owns its save control and feedback. The browser keeps one
unresolved request and leaves other drafts editable; the append endpoint still
accepts batches from existing clients. A saved receipt confirms persistence only. The optional companion reports
connection status and queue acceptance independently. `src/companion` owns local
configuration, verified cursor catch-up, an exclusive state lock, a crash-safe
delivery journal, and the Codex CLI call. `src/web/companion-router.ts` accepts only
service credentials; private browser conversation events use browser credentials.
Both streams recheck authentication and plan access while connected. Revision
notices carry no answer bodies. The registry permits one connected companion per
owner/plan and requires acknowledgements within 45 seconds. It is deliberately
process-local; deployment remains a single application process. A distributed
server would need shared connection claims and event delivery.

The agent can finish after posting questions when its current thread is explicitly
linked. The companion's configured Codex home provides the queue storage shared
with the owning Codex process. A queue receipt confirms acceptance only. An
interrupted thread stays paused; an unloaded thread waits for a later resume.
See [queue companion](queue-companion.md) for setup and uncertain delivery recovery.
