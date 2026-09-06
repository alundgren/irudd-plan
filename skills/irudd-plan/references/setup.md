# Codex setup

This integration supports Codex CLI only. The tested baseline is CLI 0.153.4
with its `mcp_2026_07_28` development feature enabled. Treat 0.153.4 as the minimum
supported version for this skill, not a claim about the first release containing
the feature. Other clients and newer CLI releases need their own successful
preflight. Check the installed binary with `codex --version` and
`codex features list`. A plain feature-list subprocess reads saved settings;
it does not inherit another Codex process's command-line overrides. If the
session uses `--enable mcp_2026_07_28`, use the same flag when listing features:
`codex --enable mcp_2026_07_28 features list`. Successful recorded requests with
the required protocol establish negotiation; a saved setting alone does not.

Install from a clean public checkout with `bash scripts/install-skill.sh`.
It copies the entire skill into `~/.agents/skills/irudd-plan`. An explicit first
argument selects another skill root, such as a project's `.agents/skills`.
Restart Codex to discover it. The installer refuses to overwrite an existing
skill so an update cannot silently replace local changes.

Configure the following in the Codex host's user `config.toml`. Replace only the
hostname. Export credentials from the operator's secret store into the process
that launches Codex; do not put their values in TOML, Git, prompts or logs.

```toml
[features]
mcp_2026_07_28 = true

[mcp_servers.irudd-plan]
url = "https://plans.example.com/mcp"
required = true
startup_timeout_sec = 15
tool_timeout_sec = 60

[mcp_servers.irudd-plan.env_http_headers]
CF-Access-Client-Id = "CF_ACCESS_CLIENT_ID"
CF-Access-Client-Secret = "CF_ACCESS_CLIENT_SECRET"
```

These are Cloudflare Service Auth credentials, not the service's signing key or
a GitHub token. The tunnel forwards a signed Access assertion; the origin
validates its signature, issuer, audience and expiration. The service token's
verified `common_name`, its client ID, maps to an internal owner via
`OWNER_MAPPINGS_JSON`. A browser email mapping can point to the same owner but
has kind `browser`; MCP requires kind `service`.

For a rotating local secret provider, Codex also accepts `http_headers_helper`
instead of `env_http_headers`. The helper prints a JSON object of header names
to string values. Keep the helper and its output private; do not run it in a
recorded terminal to inspect secrets. Environment-backed headers are sufficient
for the initial supported setup. Restart Codex after changing their values.

[Official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
documents required startup and header inputs. The service uses
[MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28), including
stateless discovery and per-request metadata. Do not switch to legacy initialize.

## Preflight

From the public checkout, install the pinned development dependencies with
`vp install --frozen-lockfile`. Supply these non-secret selectors and credentials
from the operator's environment, then run `vp run preflight:mcp`:

```text
IRUDD_MCP_URL=https://plans.example.com/mcp
IRUDD_OWNER_ID=owner-a
IRUDD_PLAN_ID=the-explicit-plan-id
IRUDD_ITEM_ID=the-explicit-item-id
CF_ACCESS_CLIENT_ID=<secret-store input>
CF_ACCESS_CLIENT_SECRET=<secret-store input>
```

The command negotiates the pinned protocol, checks required tools, reads the
contract/skill versions and mapped owner, retrieves the selected packet and its
MCP resource, and verifies every required asset digest. It prints only identifiers,
versions and an asset count. It does not perform visual inspection for the agent
or certify that Codex itself called the server.

In a fresh Codex session, invoke this skill, call `get_contract`, retrieve that
same item with `get_work_item`, inspect its required visuals and call
`check_packet`. Record the CLI version, successful calls and observed result.
A first planning session without any existing packet can check compatibility,
create its authorized plan, then use the resulting item for the retrieval check.
Do not claim full setup passes until both the client and fresh Codex checks pass.

## Repair

- Startup or protocol failure: restore the endpoint, enable the feature and use
  the supported CLI; verify the server advertises `2026-07-28`.
- Authentication failure: check Service Auth policy, renew expired credentials,
  and check the configured issuer, application audience and owner mapping. Never
  print credential values.
- Contract or skill mismatch: install matching public skill/server versions and
  repeat preflight. Do not remove validation.
- Missing item or asset: verify the explicit IDs and owner; restore required
  content or obtain a deliberate plan correction from the human. Do not select
  another item or use a caption as a substitute.
- Browser reconnecting: report that the canvas is disconnected and may be stale.
  Restore connectivity and wait for the current live revision before claiming
  that the human can see an update.

The public repository's `docs/operations.md` and `docs/smoke-tests.md` contain
operator deployment commands. Deployment through the actual Cloudflare endpoint
must be observed separately from the local tests; the local verifier is not
Cloudflare certification.
