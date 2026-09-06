# Fresh sessions

## Planning

Example request: "Use irudd-plan for the repository example/project. Owner is
owner-a. Plan a CSV importer with ten work items and a diagram. Store the plan
privately and keep the canvas current. We agreed rows with missing IDs fail."

Call `get_contract`, then draft the complete plan using the contract example.
Upload the diagram and include its returned descriptor where required. Write
with a unique operation ID and `expectedVersion: null`. Return the human link
from `get_github_reference`. Record the missing-ID decision with its actual
conversation source and reason. Do not record agreement on other draft choices.

When the human requests a revision, deliberately call `get_plan`, edit the
current complete document, and write with its `internalRevision`. Confirm the
write's version and retrieve the changed item. Report that the canvas has a new
revision; call it live only if the browser is connected and shows that revision.
A copied review prompt is a request to assess changes, not blanket approval.

## Implementation

Example request: "Implement item-import in irudd-plan://plans/csv-import/items/item-import.
Expected owner is owner-a. Use the selected packet and validate the result."

Call `get_contract`, then `get_work_item` for those exact IDs. Record, for
example, internal revision 4 and packet digest H1. Inspect every required visual.
If the packet's optional context `csv-encoding` is needed, deliberately call
`get_related_context`, record its digest and inspect its required assets.
Do not read the other nine specifications simply because their IDs are listed.

Before completion call `check_packet` with H1. If an unrelated sibling changed,
it returns unchanged and the implementation can finish. If a selected requirement
changed from rejecting all blank fields to rejecting only missing IDs, it returns
changed. Retrieve the packet again, reconcile that requirement in code and tests,
then check the new digest. Do not restart for unrelated edits or ignore relevant
ones. Service failure stops completion even when local tests pass.

## GitHub handoff

After the calling workflow authorizes publication to its exact GitHub target:

1. Call `get_github_reference` for the plan and optional item. Put its
   `githubText` in both the issue and PR body. This includes a short goal plus
   explicit human link and MCP reference. Keep the detailed requirements in the
   plan. A short goal alone cannot be used for implementation.
2. The calling agent publishes through its authorized GitHub tool. The service
   performs no GitHub writes. Do not infer GitHub authorization from an MCP
   write, review result, or plan publication.
3. Call `verify_github_repository` with `contractVersion` and `planId` if the
   plan is not verified. After successful GitHub publication, call
   `associate_github_work` with `contractVersion`, `planId`, optional `itemId`,
   `type: "issue"` or `"pull_request"`, and the actual `number`.
4. Call `get_github_reference` again and verify `associatedWork` contains the
   intended type, number, URL and item ID. An item reference returns its item's
   associations; a plan reference returns all associations. Report any failed
   association as incomplete even though the GitHub publication succeeded.
   After repair, repeating the same association is safe and does not duplicate it.

Example body, using the actual returned links:

```text
Reject CSV rows with missing IDs.

Plan: https://plans.example.com/plans/csv-import/items/item-import
MCP: irudd-plan://plans/csv-import/items/item-import
```

For public-repository plans, `publish_plan` requires explicit authorization to
expose the plan and its assets. Private-repository plans cannot be published.
Unattached plans expire 30 days after creation. Attached plans remain while any
linked work is open, then expire 30 days after the latest verified closure.
Unknown GitHub status retains data. Deleted data has no backup or recovery in v1;
the short goal left on GitHub does not replace the unavailable plan.
