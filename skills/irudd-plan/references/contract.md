# Plan contract v1

Every ordinary call includes `contractVersion: "v1"`. `write_plan` instead
carries it inside `plan`. Calls may appear with a client-added server prefix.
Read each tool's discovered schema. An `isError` result is a failure even when
HTTP succeeded.

A full plan contains `contractVersion`, stable `planId`, `repository` with
`provider: "github"`, owner and name, `epicGoal`, and arrays `items`, `contexts`,
`decisions`, `assets`. [plan.json](plan.json) is a complete creation example;
replace its IDs, repository and requirements with the actual task. It needs no
private files. Empty arrays are valid when the task requires no such records.

Each item has `id`, `title`, `shortGoal`, complete `goal`, `requirements`,
`relevantPriorArt`, `checks`, `deferrals`, `completionExpectation`,
`acceptanceCriteria` with stable id/text pairs, `requiredContextIds`,
`requiredDecisionIds`, `requiredAssetIds`, and `relatedItemIds`.
Optional `dependsOnItemIds` lists direct prerequisite item IDs in the same plan.
A lists B when B must precede A. It is independent of `relatedItemIds`; absent
means no declared prerequisites. Self references, repeated IDs, missing IDs and
cycles fail with structured errors identifying the affected IDs. Disconnected
items and diamonds are valid.

Before sending this field, even an empty list, require
`get_contract.features.itemDependencies: true`. An absent or false feature means
stop and update the server. Contract and skill versions remain exactly `v1`.
Legacy dependency-free clients remain compatible. Unknown fields can be dropped
by decoders, so matching `v1` alone does not prove dependency support.

Replacements must explicitly retain or clear each existing nonempty dependency
list. Omission fails inside the version-checked transaction without changing
the prior revision. `[]` clears it. Removing an item also requires removing all
incoming references in the same replacement. No edges are silently removed.

Contexts and decisions have `id`, `title`, `body`, `reason`, optional `source`,
`requiredContextIds`, and `assetIds`. Required references must exist and context
requirements must be acyclic. Use source to identify recorded evidence or human
agreement precisely, without copying private conversational detail.

Decisions additionally require explicit `state`: `decided`, `human-needed`, or
`implementer-decides`. Missing and unknown states are invalid, with no defaults.
A `human-needed` record requires nonempty `question` and `questionId` naming an
existing question in the same owner's plan, and must omit `constraints`.
An `implementer-decides` record requires nonempty `question` and `constraints`
and must omit `questionId`. A `decided` record uses `body` as the chosen outcome
and must omit `questionId`; it may retain `question` and `constraints` from a
delegated choice. All states retain the stable ID, title, current body, reason,
source and required references. The server checks structured fields, not whether
arbitrary prose constraints have been satisfied. Public documents omit decision
question IDs and all context/decision source provenance.

Require `get_contract.features.decisionStates: true`. These semantics retain the
v1 envelope and protocol but require updated clients and explicit records.
Old-plan preservation and compatibility adapters are outside this delivery.

`get_work_item` includes `specificationCursor: {revision, digest}` for
`patch_plan.expectedVersion` and `expectedDigest`. Both `get_work_item` and
`check_packet` return `decisionReadiness: {canStart, canComplete, humanNeededIds,
implementerDecidesIds}`. Human-needed choices prevent starting and completion.
Implementer choices permit starting but prevent completion. No outstanding
choices permits both. This is decision readiness only, not execution permission,
GitHub eligibility, test status, or overall completion. Packet freshness and
readiness are independent. Saving an answer or resolution never changes either.

`get_work_item` returns the complete selected item with recursively required
contexts, decisions and asset descriptors, plus `epic.goal`, repository and a
compact index. Both overview and item-packet indexes contain IDs, titles, short
goals, related item IDs and optional dependency IDs. Dependencies do not pull
sibling specifications into the packet or enforce implementation eligibility.
`relatedContextIds` lists other contexts for deliberate lookup. `get_plan` is
an explicit full-document read for planning, not an implementation prerequisite.

`internalRevision` is a plan-wide integer used as `expectedVersion` when
replacing a plan. `packetVersion` is a selected-content SHA-256 digest. It covers
the item and its required contexts, decisions and assets, not unrelated siblings
or optional context read later. The selected item's dependency IDs are covered;
graph changes visible only in the compact index are outside this digest. Legacy
absent fields stay absent and retain their original digests. A new internal revision alone does not require
restarting implementation. `get_related_context` also returns a packet digest;
reread it if implementation depends on that optional context.

## Assets

`upload_asset` needs `contractVersion`, `planId`, `assetId`, `mediaType`, `caption`,
`role` and `bytesBase64`. Role is `binding-reference` or `illustration`. Use the
returned descriptor verbatim in `plan.assets`, then reference its ID from the
item or required record. All assets required by the packet must be retrieved
and inspected, including illustrations. Binding references constrain the task;
illustrations explain it without adding unstated requirements.

Rendered media are PNG, JPEG, GIF, WebP, SVG or self-contained HTML. No relative
or remote dependencies are allowed. Optional `source` on upload contains
`mediaType` and `bytesBase64` for text, JSON or SVG. Retrieve source using
`get_asset` with `content: "source"`; verify its bytes against
`descriptor.source.digest`. This does not replace inspection of rendered bytes.

For a returned rendered result saved as `asset-result.json`, this portable
example verifies and decodes its structured content. Choose the extension
matching `mediaType`, then open the output with a suitable isolated viewer:

```python
import base64, hashlib, json
from pathlib import Path
result = json.loads(Path("asset-result.json").read_text())
content = result.get("structuredContent", result)
data = base64.b64decode(content["bytesBase64"], validate=True)
assert "sha256:" + hashlib.sha256(data).hexdigest() == content["descriptor"]["digest"]
Path("reference.svg").write_bytes(data)
```

Do not run downloaded HTML scripts with host filesystem, network or credential
access. Inspect in the service's isolated viewer or an equivalently isolated
renderer. If inspection is unavailable, stop. A replacement asset uses a new
digest; old bytes do not change.

## References

- Overview: `irudd-plan://plans/{planId}`
- Item: `irudd-plan://plans/{planId}/items/{itemId}`
- Context: `irudd-plan://plans/{planId}/contexts/{contextId}`
- Rendered asset: `irudd-plan://plans/{planId}/assets/{assetId}?digest={digest}`

Percent-encode IDs and digest query values. References resolve current content,
not historical revisions. Use `get_github_reference` for the human link and MCP
reference instead of constructing a public URL. Required MCP failure remains a
stop condition even if a browser page still displays cached content.

## Private agent context

The additive `agentContext` feature provides `get_agent_context`,
`get_agent_context_entry` and `append_agent_context`. See [sync](sync.md) for
cursor, correction and retry semantics and [conversation](conversation.md) for
writing examples. Conversation entries may include one optional `source` with
`entryId` and a plain-language `label`, referencing an immutable note in the same
owner's same plan. Require this feature before sending source references.

Agent context has its own table and revision stream. It is excluded from
`get_plan`, `sync_plan`, public documents and selected implementation packets.
Changing findings alone does not change packet digests. Binding requirements
must be copied into work items or their required contexts/decisions/assets.
The authenticated browser can read a cited note by ID but cannot write agent
context. Publication does not expose context. Plan deletion cascades to context.

The migration only adds storage. Existing conversation JSON, IDs, author fields,
digest chains and browser drafts are not rewritten. Legacy technical notes stay
visible until an explicitly designed cleanup is separately authorized; there is
no title-based classification. Old clients continue their existing conversation
workflow; updated planning skills stop when the new feature is absent.
