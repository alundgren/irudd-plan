# Try collaborative planning in production

The existing MCP transport and Cloudflare credentials are sufficient. This
change adds no external queue, webhook, worker service, agent daemon or new
environment variable. It adds a SQLite table for the private conversation;
startup applies the committed migration before readiness.

## Before deployment

Keep the previous image digest and a consistent backup of the `/data` volume.
Stop the service before copying the volume, or use SQLite's online backup API;
do not copy only the main database file while it has an active WAL. This is
needed to undo data changes, not merely to roll back the application image.
Keep the persistent volume mounted when deploying the new image.

## Refresh planning instructions and clients

Update the installed `irudd-plan` skill from this repository. The installer
intentionally refuses to overwrite an existing copy: compare it, move its old
folder outside the skill search directories, then run:

```sh
bash scripts/install-skill.sh
```

Keep the old skill copy alongside the previous image for rollback. Update the
`plan-issues` instructions from the companion `irudd-skills` change through your
normal skills update workflow too. No global skills were replaced by this coding
session. If using `plan-issues`, select its `irudd-plan` planning mode. A direct
request naming `$irudd-plan` and the desired repository can use the public skill
without changing the issue-planning preference.

Start a fresh agent session so it loads the new skill and tool catalog. Reload
the browser to use the matching client. Before trying a plan, require:

- `get_contract` returns owner `alundgren` for this operator and features
  `planningConversation`, `planDeltas` and `incrementalSync`, all true.
- Tool discovery includes `sync_plan`, `get_planning`, `append_planning`,
  `patch_plan`, and `get_operation`.
- The browser signs in under a `browser` mapping to that same owner. Browser
  GET and POST requests under `/api/plans/*/planning` must reach the origin.
  Keep `/api/*` behind browser Access; do not add a public bypass or CORS rule.

The already configured MCP service token is working. These checks still need
to be observed against the new deployment; local tests do not establish them.

## Exercise the real loop

Start with a disposable private plan:

> Use $irudd-plan to plan a small change in alundgren/irudd-plan. Expected owner
> is alundgren. Put your first questions on the canvas immediately, use the
> incremental sync protocol, and wait for my browser answers. Do not implement
> or publish anything yet.

Open its returned plan URL and choose Planning. Answer several questions and
save them together. The active agent polls from its last conversation cursor,
receives only those new answers, and adds a follow-up batch. Let it update one
specification record and verify that `sync_plan` returns just that change.
An idle poll should return `unchanged` with no record bodies.

Refresh the browser and start another agent session using the same plan
reference. Saved conversation survives. An agent with retained state resumes
from its cursors; one without it bootstraps in bounded pages. Disconnect briefly,
reconnect, and confirm the cursor catches up without duplicate questions/answers.
An uncertain mutation can be checked with `get_operation` by its original ID.

Keep the agent session active while answering. Saving an answer does not launch
or wake a stopped agent session. No additional setup can enable that behavior
in this implementation; a later agent-runner integration would be needed.

Plans and discussion remain private without `publish_plan`; deploying the app
is sufficient for the trial. Unattached plans still expire 30 days after creation,
and activity does not extend expiry. Use the existing authorized GitHub
association workflow if a plan must follow the lifetime of open work.

## Roll back or iterate

Redeploy the previous application image and restore its matching skill if you
want the previous workflow. The schema change is additive: old code ignores the
conversation table, and the established plan JSON stays compatible. Saved
conversation is unavailable in the old UI but remains in the volume for a later
redeployment, subject to the plan's normal retention/deletion policy.

An image rollback does not undo specification edits or submitted answers. Restore
the consistent volume backup if that is what you intend; writes made after the
backup will be lost. A restored/divergent server may reject retained cursors.
Clients then discard cached server state and recover through bounded reads.
Do not delete migration history or try to reverse the schema manually.
