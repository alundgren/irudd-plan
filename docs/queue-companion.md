# Codex queue companion

The companion forwards newly saved human planning batches to one explicitly
selected Codex thread. It runs on the machine holding that thread's Codex home.
It uses `codex queue`, not hooks, a waiting tool, or T3's internal API. It never
resumes or creates a thread. Agents can end their turns while awaiting answers.

Codex 0.153.4 was verified with disposable App Server processes and a localhost
fake model. Idle delivery, busy-turn ordering, interruption, cold resume, and
the complete canvas-to-companion path are exercised by `vp run trial:companion`.
No real model credentials or existing sessions are used by that trial.

## Configure an explicit target

Use a Codex **thread UUID**, not a T3 conversation ID or a session name. The
working directory must match that thread's stored working directory. The
companion verifies metadata through Codex without resuming the thread. Use a
separate state directory for each binding; do not share it across machines.

Create a local configuration file outside the repository:

```json
{
  "serverUrl": "https://plans.example.com",
  "ownerId": "owner-a",
  "planId": "csv-import",
  "threadId": "00000000-0000-0000-0000-000000000001",
  "cwd": "/absolute/path/to/the/thread/worktree",
  "codexHome": "/absolute/path/to/.codex",
  "stateDirectory": "/absolute/path/to/companion-state/csv-import",
  "headersEnv": {
    "Authorization": "IRUDD_COMPANION_AUTHORIZATION"
  }
}
```

Set `IRUDD_COMPANION_AUTHORIZATION` through your credential manager to the full
`Bearer ...` value for an irudd-plan service credential. `headersEnv` also supports
Cloudflare Access service-token headers when the deployment uses those. Tokens
never belong in the JSON file, command arguments, plan, or delivery journal.
The configured header variables are removed from Codex subprocess environments.
The service credential must resolve to the configured owner. The updated server
must advertise `features.queueCompanion`.

`codexHome` defaults to the process's Codex home. `codexBinary` optionally selects
an absolute executable path; otherwise the executable is `codex` on PATH. The
server URL must use HTTPS, except for localhost tests. Redirects are rejected.

From this checkout, run:

```sh
vp run companion init /absolute/path/to/companion.json
vp run companion run /absolute/path/to/companion.json
```

Initialization records the current conversation head and deliberately skips
existing human entries. Initialize **before** collecting the answers to forward.
Restart with `run`, not `init`, to catch up on answers saved while disconnected.
The foreground process can be supervised by the operator's normal service
manager. No system service or global Codex configuration is installed implicitly.

Tell the planning agent that this exact thread is linked to the queue companion.
Use the updated irudd-plan skill. After posting questions, the agent checks the
delivery metadata, records its handoff, and finishes. Future queue messages tell
it to retrieve the new conversation entries. They do not include answer bodies
or authorize additional implementation or publication.

## Delivery and status

The service streams revision notices over an authenticated SSE connection.
The companion retrieves and verifies only new conversation pages, groups entries
by saved operation ID across page boundaries, and invokes Codex once per human
batch. Agent entries advance the cursor without enqueueing another message.
Reconnects reconcile from the last durable cursor. No model participates in
connection maintenance. The browser also uses conversation events instead of
periodic refreshes.

The browser shows companion connectivity and queue acceptance. Neither proves
the agent is running. Connections need acknowledgements within 45 seconds;
server restarts discard connection status. Credentials and plan access are
revalidated during the event stream. Only one live companion can claim a plan.

Codex checks shared queue storage for cross-process writes every 10 seconds.
An idle, loaded thread starts another turn. A busy thread processes the queued
message after its current turn. Interrupted threads stay paused, and unloaded
threads wait until resumed. Closing the companion stops future forwarding but
does not retract messages already accepted by Codex.

CLI, desktop, and T3 must use compatible Codex versions and the same local queue
storage for this route. The queue mechanics and a separate stdio App Server were
tested; desktop and T3 UI rendering of externally started turns have not been
verified. This companion does not promise cross-machine delivery or start a
closed application. Do not load the same thread into competing agent processes.

## Uncertain outcomes

The private state directory contains `state.json` and an exclusive `run.lock`.
Before enqueueing, the companion atomically saves and syncs an `attempt` containing
the operation ID and its ending cursor. Only a recognized successful queue receipt
clears the attempt. Timeout, process failure, malformed receipt, or a crash after
enqueueing stops delivery. Restarting cannot automatically retry that attempt.

Inspect the linked session and queue to establish whether the batch was accepted.
Then record the verified outcome explicitly:

```sh
vp run companion resolve /absolute/path/to/companion.json OPERATION_ID queued
vp run companion run /absolute/path/to/companion.json
```

Use `not-queued` instead of `queued` only after establishing that it was not
accepted; the next run will retry it. If the outcome is still unknown, leave the
companion stopped. The CLI has no idempotency-key option, so blindly retrying can
duplicate input. Never delete state to work around a failure. After an unclean
process exit, remove `run.lock` only after confirming its recorded process is
gone. A changed owner, endpoint, plan, thread, working directory or Codex home
requires a separate binding and state directory.

Cursor divergence stops delivery for review. It never automatically resets to
revision zero or replays historical answers. All commands are passed as an
argument array without a shell, and remotely supplied plan content cannot select
the executable, working directory, Codex home, or thread.
