# Plan together on the canvas

Use this workflow for a direct planning prompt or an issue-based planning session.
Read [incremental synchronization](sync.md). Require `get_contract.features.planningConversation`,
`planDeltas`, `incrementalSync` and `agentContext` before using this workflow. If any is missing, report that the server needs updating. Do not describe
browser-local feedback as submitted answers.

Create the plan immediately with `write_plan`, using the actual repository and
prompt as the initial goal. Empty items, contexts, decisions and assets are
valid. For an existing plan, synchronize the specification with `sync_plan` and discussion with
`get_planning`, and agent findings with `get_agent_context` before continuing. Reuse stored cursors and fetch only deltas.
Keep the existing plan's subject; create a separate plan for a different task.
Use `get_github_reference` for its human URL. The browser's Planning button opens
the discussion; a plan with no items opens it by default.

## Questions and answers

Send the first useful batch of questions with `append_planning`. Every entry has
an immutable `id`, a `section`, `kind` and `body`. Use as many sections as the
conversation needs. Group independent questions so the person you are working
with can answer them together. Explain consequential choices with a concrete
example, diagram or image when that makes them easier to understand. Upload
visuals first and put their exact descriptors in the entry's `assets` array.
These attachments do not need to enter `plan.assets` unless the specification
also needs them. HTML and SVG use the existing isolated asset viewer.

The discussion is a pannable, zoomable canvas. Each question has its own answer
area. Attachments appear as separate documents beside that question, in array
order. Attachments on a reply appear beside the original question too. Use this
space to help the person inspect the actual options, not just read about them.

When someone asks to see examples or compare alternatives, create the examples
before asking them to choose again. For example, a comparison of two agent-file
approaches can show two labeled HTML documents containing the proposed file
contents, launch instructions and a small loading diagram. Upload each document
with `upload_asset`, then append a short reply with both descriptors in `assets`
and `replyTo` pointing to the question. The browser places the two documents
side by side. Do not answer a request to see the files with another long prose
account of what they would contain. Mark illustrative files as examples and
verify runtime-specific syntax before presenting it as usable configuration.

Use HTML for formatted file previews or alternate proposals, SVG or images for
diagrams and mockups. Keep each alternative in its own attachment with a clear
caption so it can be opened at reading size. HTML code examples must escape
`&`, `<` and `>` inside `pre`/`code`; use inline styling and no external resources.
Include the original file as the upload's optional source when useful. Short
code snippets can also use fenced code blocks in a message body. Keep the reply
focused on the difference the person should inspect. A simple question can
stay text-only; choose a visual or document when it helps reach understanding.

For example, after `get_planning` returns revision 0, replace the digest
placeholder below with its actual `cursor.digest`:

```json
{
  "contractVersion": "v1",
  "planId": "csv-import",
  "operationId": "scope-questions-1",
  "expectedRevision": 0,
  "expectedDigest": "<copy cursor.digest from get_planning>",
  "entries": [
    {
      "id": "invalid-rows",
      "section": "Import behavior",
      "kind": "question",
      "body": "An import contains 100 rows and 2 have invalid dates. What should happen?",
      "choices": [
        "Import 98 rows and report the 2 errors",
        "Reject the entire import"
      ]
    }
  ]
}
```

Choices are suggestions, never preselected answers. The person can write their
own answer and submit several answers together. Only the authenticated browser
can create entries marked as human answers. Do not impersonate a browser
submission through shell HTTP calls. If an answer arrives in agent chat, record
it as an agent note with its actual source.

Use `get_planning` with the last verified `cursor` to collect new entries while waiting.
Follow bounded pages while `hasMore` is true; advance only to each returned cursor.
Poll at a reasonable interval, such as 5 seconds, while the session is active.
This is a two-way polling connection, not a callback that starts an idle agent.
Do not promise automatic resumption after the session ends. A new session reuses cached state and cursors when available, then reads only
new discussion and specification records. Without that state, bootstrap through
bounded pages and identify open questions before proceeding.
Do not end the turn merely because questions have been posted. Continue bounded
incremental polling while actively waiting, then process replies and continue
planning. Do not open a native session question tool for those same decisions
or repeat the complete question batch in chat. Chat may link to the canvas and
report progress. Work on independent tasks between polls when useful.

If the person voluntarily answers in chat, reconcile it with the original
question. Append an agent note with `replyTo`, the original section, and wording
such as "You answered in session chat: accept CSV." Preserve the actual source;
do not create a browser-authored answer. Resolve only what the reply settles.

Process new entry IDs once. Acknowledge a settled answer by appending a `resolved`
entry referencing its original question, with the explanation the person needs.
Before processing after an interruption, synchronize all streams and inspect
existing resolutions and newer replies. Reconcile unfinished specification
writes using their operation receipts. A later answer to a resolved question
must be considered again. Use agent context for a handoff recording processed
reply IDs and outstanding work, not another human-facing status section.

If interrupted, explicitly stopped, or limited by the runtime, persist a handoff
when possible and state that the session has stopped. Saving on the canvas
persists answers but cannot restart an idle agent. On resumption retrieve deltas
from retained state; if state is missing, bootstrap bounded pages and identify
unanswered questions and replies newer than their resolutions. Automatic wake-up
requires a separately supported runtime integration; this server has none.

The canvas-specific final-response rule is to link to the canvas and name the
outstanding topics, without copying its questions or opening another prompt.
The authoritative Codex AGENTS.md must carry that exception to its general rule
requiring unanswered questions in final responses. A skill cannot override a
higher-priority instruction: if the installed rule still requires full questions,
report the configuration conflict and follow that instruction until updated.
See [setup](setup.md#canvas-workflow-instructions).

Reply with a note, follow-up question, or `resolved` entry whose `replyTo` is the
original question ID and whose section matches that question. Entries are
append-only so a revised answer or correction preserves earlier context. A
resolution records the agent's understanding, not human approval. New answers
after resolution require reconsideration. Keep proposed choices distinct from
human decisions. Record where a decision came from and why.

## Build the specification as decisions settle

Use `patch_plan` with `expectedVersion` and `expectedDigest` from the current
specification cursor and a unique `operationId`.
Each supplied array upserts complete records by stable ID; omitted records stay
unchanged. Use `removeItemIds`, `removeContextIds`, `removeDecisionIds` or
`removeAssetIds` for explicit removal. Requirements still need complete item
records, valid references and dependency lists. The conversation revision and
specification version are independent.

Keep understandable questions, alternatives and decision-relevant summaries in the discussion. Put
settled requirements and the rationale needed for implementation in work items
and required contexts/decisions. Upload and attach binding visuals to those
records deliberately. `get_work_item`, packet digests, compact overviews and
public plan views exclude the private conversation. Publishing a specification
does not publish discussion-only attachments.

After a conflict, synchronize the affected stream, reconcile its deltas, and
use a new operation ID. A divergent cursor requires bounded recovery as described
in sync.md. After an uncertain result, use `get_operation` to check the receipt
or retry identical input with the same operation ID. Do not change the request under that
ID. Keep unresolved answers and proposed changes visible until reconciled.

When details are settled, check the specification against the discussion and
return focused item references for implementation. The conversation remains a
private record under the plan's existing retention policy, including its expiry.
It is not an implementation packet or authorization to execute or publish work.

## Agent working context

Use `append_agent_context` for repository findings, commit hashes, paths,
investigation progress, scout tracking, preservation evidence and handoff notes.
Use a concise title and a focused body. Each note is immutable. Correct a finding
with a new ID and `supersedes` pointing to its latest version. Retain old notes
for attribution, and reduce correction chains locally to the current findings.
`get_agent_context` returns bounded incremental pages using its own cursor;
`get_agent_context_entry` retrieves a deliberately selected note without history.
These records are private to the authenticated plan owner, including on published
plans. They expire with the plan. Do not store secrets there.

For example, after reading the agent-context cursor:

```json
{
  "contractVersion": "v1",
  "planId": "csv-import",
  "operationId": "inspect-importer-1",
  "expectedRevision": 0,
  "expectedDigest": "<copy cursor.digest from get_agent_context>",
  "entries": [
    {
      "id": "importer-evidence-1",
      "title": "Existing importer behavior",
      "body": "src/import/read.ts rejects the whole file if a date is invalid. Preserve the existing tab-delimited format when changing row handling."
    }
  ]
}
```

The conversation might then say "The importer currently rejects the whole file.
Keeping valid rows would let you fix only the errors." Attach optional
`source: {"entryId": "importer-evidence-1", "label": "Current importer behavior"}`
only when inspecting the evidence helps assess that recommendation. The browser
loads the cited version on demand. Do not add source controls to every question.
Agent findings are not human decisions, and a cited note is not a requirement.
Copy the tab-format preservation requirement into the selected work item's
requirements or a required context before handing it to an implementer.

Existing conversation entries remain unchanged, even if their titles sound
technical. Never infer classification from titles or silently remove history.
For an explicitly requested cleanup, copy identified evidence to agent context,
retain its original entry ID in the note, and explain the correction briefly.
This release does not remove or hide the original conversation entry. Preserve
human answers and their original attribution. Implementation packets must remain
complete without fetching conversation or agent-context history.
