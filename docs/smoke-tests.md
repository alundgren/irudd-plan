# Smoke tests and deployment evidence

## Clean checkout and local tests

```sh
vp install --frozen-lockfile
vp run check
vp run test
vp run example:database
vp run build
vp exec playwright install chromium
vp run test:browser
vp run smoke:browser
vp run skill:install /tmp/irudd-skill-check
```

Choose an unused installation directory. The installed folder is
`/tmp/irudd-skill-check/irudd-plan`; verify its linked references are present.
The installer deliberately fails if the destination exists.

The unit/client suite covers pinned 2026-07-28 discovery, signed JWT verification,
rejected/expired credentials, incompatible contracts, required asset failure,
stale writes, reconnect and selected-packet comparison across sibling edits.
The browser suite covers private/public rendering, assets, local feedback,
revision delivery, disconnect and recovery. The smoke loop creates a disposable
plan, copies feedback, revises via MCP, verifies the browser update, publishes
it and checks anonymous assets and live updates. These local runs inject test
identities and a fake read-only GitHub reader. They do not certify Cloudflare.

## Fresh Codex trials

With Codex already authenticated and Chromium installed, run:

```sh
vp run trial:codex planning
vp run trial:codex selected
vp run trial:codex unrelated
vp run trial:codex missing-asset
vp run trial:codex offline
```

Each command starts a disposable local service and a fresh CLI session in a
temporary directory containing only the public skill and trial input. User skill folders are explicitly disabled for that CLI invocation and
project guidance loading is disabled. The fake service credential is supplied by an
environment-backed header, `required = true` is set, and the modern MCP feature
is enabled. Trial-only MCP `approve` mode permits writes to the disposable fixture;
it is not a deployment approval recommendation. No GitHub write tools are added.
The CLI uses the operator's configured authentication and default model. This
consumes normal model usage. A five-minute timeout ends an unresponsive trial.

Inspect `requests.json`, `result.txt`, `observed-plan.json`, `transcript.jsonl`,
and generated `greeting.py` in the printed temporary directory. Exit zero alone
is not a behavioral pass. Check these observations:

| Trial         | Required observation                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| planning      | Creates and revises ten items through MCP, inspects the required image and deliberately reads optional context. Only the stated greeting decision is treated as agreed. |
| selected      | The first packet says Hello; the service changes it to Welcome during work. The agent identifies the changed packet and tests Welcome before completion.                |
| unrelated     | Only a sibling changes. The final selected packet remains unchanged and Hello is tested without restarting for that sibling.                                            |
| missing-asset | The agent stops after required asset retrieval fails, names repair steps, and produces no implementation.                                                               |
| offline       | Required server discovery fails and the CLI stops startup. No task implementation occurs.                                                                               |

Check every observed request uses protocol `2026-07-28`. Verify that implementation
sessions do not retrieve the full plan or nine sibling specifications by default.
The rendered diagram has an amber circle on the left, a teal circle on the right
and a connecting line. The agent must actually inspect it, not infer that from
its caption. Keep raw trial transcripts private; record only non-secret findings
in public validation evidence.

## Actual Cloudflare deployment

These steps belong to operator commissioning, tracked in issue #5. A local pass
is not an observed deployment pass. Use a disposable **public** repository that
is allowlisted for the configured read-only GitHub App. The browser smoke
command explicitly creates and publishes synthetic plan data there; it makes
no GitHub writes. The unattached plan expires normally after 30 days.

Follow [operations](operations.md). Export `CF_ACCESS_CLIENT_ID` and
`CF_ACCESS_CLIENT_SECRET` from the secret store. Set `IRUDD_MCP_URL`,
`IRUDD_OWNER_ID`, `IRUDD_PLAN_ID`, and `IRUDD_ITEM_ID` to an existing trial packet.
Run `vp run preflight:mcp`, then repeat the fresh Codex planning/implementation
examples from the installed skill against the actual endpoint.

For the rejection checks, provide `CF_ACCESS_EXPIRED_CLIENT_ID` and
`CF_ACCESS_EXPIRED_CLIENT_SECRET` for a genuinely expired Cloudflare service
token. Set `IRUDD_ORIGIN_URL` to the origin address reachable from the operator's
trusted host, such as `http://127.0.0.1:3000`. Run:

```sh
vp run smoke:mcp
```

This requires successful valid-credential preflight, HTTP 401/403 for invalid
and expired credentials, and HTTP 401 for the direct unauthenticated origin.
A redirect to login is a failed Service Auth setup, not a pass. A network error
is not proof of rejection. Do not expose the origin to the Internet for this test.

For the browser loop, capture a browser login state in a private file outside
the repository. Log in through the intended email/PIN policy, then close the
browser to save the state:

```sh
vp exec playwright open --save-storage=/secure/path/irudd-browser-state.json https://plans.example.com
```

Treat that file as a credential. Set these environment variables:

```text
IRUDD_SMOKE_URL=https://plans.example.com
IRUDD_BROWSER_STATE=/secure/path/irudd-browser-state.json
IRUDD_OWNER_ID=owner-a
IRUDD_REPO_OWNER=the-allowlisted-owner
IRUDD_REPO_NAME=the-disposable-public-repository
```

Then run `vp run smoke:browser`. The deployed run starts no local test server.
Its second browser context explicitly has no cookies, storage or auth headers.
It checks denied private access, private review, local feedback copy, MCP
revision, offline/reconnect status, publication, and anonymous live updates and
assets. Traces and screenshots are disabled to avoid storing authentication or
private page data. Keep any failure reports private until inspected.

Finally restart the container and rerun preflight against the same plan/item.
Observe the same stored packet and working image retrieval. Check readiness,
image architecture, volume ownership and retention status using operations
instructions. Use deterministic retention tests for the 30-day timer; do not
shorten live retention or claim a deployment retention pass from wall-clock
waiting. Record the deployed commit/image, CLI/runtime versions, non-secret
endpoint, and actual passed/failed checks in the commissioning issue. A
reconnecting browser is disconnected and may display an older revision.
