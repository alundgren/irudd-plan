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
Contexts and decisions have `id`, `title`, `body`, `reason`, optional `source`,
`requiredContextIds`, and `assetIds`. Required references must exist and context
requirements must be acyclic. Use source to identify recorded evidence or human
agreement precisely, without copying private conversational detail.

`get_work_item` returns the complete selected item with recursively required
contexts, decisions and asset descriptors, plus `epic.goal`, repository and a
compact index. The index contains IDs, titles, short goals and related item IDs.
`relatedContextIds` lists other contexts for deliberate lookup. `get_plan` is
an explicit full-document read for planning, not an implementation prerequisite.

`internalRevision` is a plan-wide integer used as `expectedVersion` when
replacing a plan. `packetVersion` is a selected-content SHA-256 digest. It covers
the item and its required contexts, decisions and assets, not unrelated siblings
or optional context read later. A new internal revision alone does not require
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
