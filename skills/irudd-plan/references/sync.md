# Incremental planning protocol

Require `get_contract.features.incrementalSync: true` alongside
`planningConversation`, `planDeltas` and `agentContext`. Do not use a revision number without
its returned digest. No new MCP transport, webhook or credentials are required.

## Read only what changed

Use `sync_plan` for the specification and `get_planning` for discussion.
Use `get_agent_context` for private agent findings.
Retain their separate `{revision, digest}` cursors with the corresponding local
state. Send the last cursor on each read. All three default to 25 records per page;
`limit` can be 1 through 100. Unchanged reads contain no record bodies. Assets
are descriptors here; retrieve exact bytes only when needed and cache by digest.
A page bounds record count, not the size of an individual specification record.
A small edit may resend its complete changed record, never unchanged records.

Start a new plan with one `write_plan` creation. For an existing plan without a
local copy, omit the cursor to bootstrap in bounded pages. Once synchronized,
do not call `get_plan` or reread old Q&A during normal interaction. Those full
reads remain available for deliberate export and legacy clients, not this loop.
A fresh agent session should reuse persisted state and cursors when available.
A cursor alone cannot reconstruct missing context: if the local copy was lost,
bootstrap again or retrieve deliberately selected implementation packets.

### Specification pages

`sync_plan` accepts `contractVersion`, `planId`, optional `cursor`, `pageToken`
and `limit`. It returns:

- `baseCursor`: the starting specification the changes apply to.
- `targetCursor`: the exact stored revision being delivered.
- `headCursor`: the latest revision observed by this request.
- `changes`: header replacement, record upserts/removals, or ID-only ordering.
- `offset`, `nextOffset`, `pageId` and `nextPageToken` for ordered, repeatable pages.

Stage pages without advancing the committed cursor. Follow `nextPageToken`
until null, checking the same base/target, consecutive offsets and page IDs.
A repeated page ID must not be applied twice. Upserts replace by collection and
stable ID; removals delete those IDs; order records give the final ID order.
Only after the last page should the staged state replace the local copy and its
cursor advance to `targetCursor`. The digest is SHA-256 of canonical plan JSON,
with recursively sorted object keys and array order retained.

Pages remain tied to their target revision while other edits happen. When the
last page arrives, poll from `targetCursor` to catch up to a newer `headCursor`.
Do not advance directly to head without receiving its changes.

### Conversation pages

`get_planning` accepts `contractVersion`, `planId`, optional `cursor` and `limit`.
It returns `baseCursor`, `cursor`, `headCursor`, `entries`, `hasMore` and `status`.
`revision` is a compatibility alias for `cursor.revision`, not the head revision.
No cursor starts at revision zero. Each entry has an immutable ID, sequential
revision and author; new entries also identify their originating operation ID.

Apply only pages whose base matches the local cursor. Each entry must follow the
previous revision. The next digest is SHA-256 of canonical JSON containing
`previousDigest` and the exact returned `entry`. Start with the returned base
digest. Verify the computed final digest against the page cursor. Ignore an
already-applied page with the same final cursor. Missing, reordered or altered
entries require recovery. Poll immediately while `hasMore`, otherwise wait about
5 seconds in an active agent session. The browser polls every 2 seconds.

## Writes and uncertain responses

`patch_plan` requires `expectedVersion` and `expectedDigest` from the synchronized
specification cursor. `append_planning` requires `expectedRevision` and
`expectedDigest` from the synchronized conversation cursor. Use a unique
`operationId` for each intended mutation and retain the exact request until its
outcome is known. The server checks revision and digest before committing.

Successful replies include the operation ID, request digest, original base
cursor, resulting cursor and `replayed` flag. An agent that knows the acknowledged
changes can advance that stream's cursor without downloading its own prose again.
A client maintaining every server-assigned entry field can instead poll from the
previous cursor; it receives only the new batch, including its own entries.

After a timeout, call `get_operation` with the operation ID. `recorded` returns
the saved request digest and result without the request body. Check that receipt
against the intended request. `unknown` is not proof a write never happened,
particularly after restoring a database. Retry the identical request and ID to
resolve it. Reusing an ID with different input fails. Never change the input
under an ID to work around a conflict.

The receipt's request digest uses the same canonical JSON hashing as cursors.
For `patch_plan`, hash `{type: "patch_plan", request}`. For `append_planning`,
hash `{type: "planning", author, request}`, with author `agent` for MCP and
`human` for the browser endpoint. Legacy `write_plan` hashes the request itself.

## Recover explicitly

`reset_required` on a read means the cursor or page token is unavailable,
divergent, ahead of the server, or scoped incorrectly. It returns no replacement
plan or history. Discard staged pages, preserve unsent work separately, and omit
the cursor for bounded bootstrap. Reconcile drafts with that new baseline before
sending another write. Do not automatically replay a draft onto different content.

`PLAN_CONFLICT` on a write usually means another edit won. Sync from the last
known cursor, inspect the delta, then submit a reconciled request with a new ID.
`SYNC_REQUIRED` means the revision exists with a different digest; recover as
above. Authentication, unavailable-plan and service errors remain stop conditions.
Cursor validation detects restored/divergent history; it cannot restore data lost
from the server. Backups are needed for that.

Normal planning retains the local state and all three cursors across the question,
answer and refinement loop. Implementation agents continue using focused
`get_work_item` and `check_packet`; discussion never enters those packets.

## Agent-context pages and writes

`get_agent_context` uses the conversation page protocol with an independent
owner/plan-scoped digest chain. Never use a conversation cursor for this stream.
`append_agent_context` requires its current `expectedRevision` and `expectedDigest`.
Hash `{type: "agent-context", request}` for the receipt's request digest. The same
replay, conflict and reset rules apply. Entries carry server-assigned agent
authorship, operation ID, timestamp and revision. A batch contains 1 to 50 notes;
bodies are limited to 40,000 characters, IDs and titles to 200.

Corrections append new IDs with optional `supersedes`; only the latest note in a
correction chain can be superseded. Old entries stay readable by ID. Polling
returns only new notes, not prior bodies. A fresh session without cached context
bootstraps in pages; an exact source lookup uses `get_agent_context_entry` with
`entryId` and does not advance a cursor. Reads currently rebuild the digest chain
from stored entries on the server, like conversation reads; paging bounds network
responses rather than database work.
