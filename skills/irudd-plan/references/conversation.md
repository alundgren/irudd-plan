# Plan together on the canvas

Use this workflow for a direct planning prompt or an issue-based planning session.
Read [incremental synchronization](sync.md). Require `get_contract.features.planningConversation`,
`planDeltas` and `incrementalSync` before using this workflow. If any is missing, report that the server needs updating. Do not describe
browser-local feedback as submitted answers.

Create the plan immediately with `write_plan`, using the actual repository and
prompt as the initial goal. Empty items, contexts, decisions and assets are
valid. For an existing plan, synchronize the specification with `sync_plan` and discussion with
`get_planning` before continuing. Reuse stored cursors and fetch only deltas.
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
End a waiting session with the plan reference and outstanding questions so the
person can continue either there or in a later session.

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

Keep questions, alternatives and discarded proposals in the discussion. Put
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
