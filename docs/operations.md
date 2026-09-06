# Operations

## Configuration

The service reads configuration from environment variables. Keep real values in the deployment secret store, not Git.

| Variable                          | Purpose                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_PATH`                   | SQLite file. Production defaults to `/data/irudd-plan.db`.                                                              |
| `MIGRATIONS_DIR`                  | Generated migration history. The image uses `/app/drizzle`.                                                             |
| `HOST`, `PORT`                    | HTTP listener.                                                                                                          |
| `REQUEST_BODY_LIMIT_BYTES`        | Maximum JSON-RPC request size. Defaults to 12,000,000 bytes.                                                            |
| `MAX_ASSET_BYTES`                 | Maximum decoded rendered asset size. Defaults to 5,000,000 bytes.                                                       |
| `MAX_ASSET_SOURCE_BYTES`          | Maximum decoded source-file size. Defaults to 2,000,000 bytes.                                                          |
| `MAX_OWNER_ASSET_STORAGE_BYTES`   | Maximum stored asset and source bytes per owner. Defaults to 100,000,000 bytes.                                         |
| `CLIENT_ASSETS_DIR`               | Built browser asset directory. Defaults to `dist/client/assets`.                                                        |
| `CF_ACCESS_ISSUER`                | Exact Access team issuer, without a trailing slash.                                                                     |
| `CF_ACCESS_BROWSER_AUDIENCE`      | Audience of the separate browser Access application; defaults to CF_ACCESS_AUDIENCE for an existing shared application. |
| `CF_ACCESS_AUDIENCE`              | Access application audience.                                                                                            |
| `CF_ACCESS_JWKS_URL`              | Team certificate endpoint. Defaults from the issuer.                                                                    |
| `OWNER_MAPPINGS_JSON`             | Operator-managed mappings from verified claims to internal owners.                                                      |
| `PUBLIC_BASE_URL`                 | External HTTPS origin used in stable published links.                                                                   |
| `GITHUB_APP_ID`                   | Numeric ID of the read-only GitHub App.                                                                                 |
| `GITHUB_APP_PRIVATE_KEY`          | PEM private key supplied by the deployment secret store.                                                                |
| `OWNER_GITHUB_INSTALLATIONS_JSON` | Owner-to-installation and repository allowlist described below.                                                         |
| `GITHUB_API_URL`                  | Optional GitHub API origin. Defaults to `https://api.github.com`.                                                       |

A service mapping normally uses the token `common_name`. A browser mapping can use `email` or `sub`. Set `kind` explicitly. Several mappings may point to one owner. MCP accepts only `service` mappings, while browser pages, JSON reads, asset reads, and update subscriptions accept only `browser` mappings.

Cloudflare must validate the service token at the protected application before it forwards the signed assertion. The origin still checks the JWT signature, issuer, audience, and expiry. Unknown verified identities receive no owner access.

## GitHub App setup

Create a GitHub App under the free personal or organization account that owns
the repositories. Set repository permissions to read-only for Metadata, Issues,
and Pull requests. Leave every other repository and organization permission at
No access. Disable webhooks, request no user authorization, and do not grant
Contents, Actions, Administration, or write access. Keep the app private.

Install it with "Only select repositories" and select each repository that the
operator intends to permit. Record the installation ID from the installation
URL. Generate a private key and place its PEM value in the deployment secret
store as `GITHUB_APP_PRIVATE_KEY`; do not commit it. `GITHUB_APP_ID` and the
operator mapping are ordinary configuration. The service signs an app JWT only
when it needs an installation token, requests the token from GitHub, and reuses
it only until one minute before its reported expiry.

`OWNER_GITHUB_INSTALLATIONS_JSON` is an array. Each entry binds one internal
owner to one installation and an explicit repository allowlist:

```json
[
  {
    "ownerId": "owner-a",
    "installationId": 123456,
    "repositories": [{ "owner": "example-org", "name": "example-repo" }]
  }
]
```

The service selects the installation from this mapping. MCP requests cannot
supply an installation ID or use a repository URL as proof of access. After a
plan is verified, its GitHub repository ID cannot change. If another repository
needs a plan, create a new plan.

## Cloudflare Access paths

Protect the application hostname with a default Access application. Use a PIN
policy for browser users and a Service Auth policy for `/mcp`. Add a more
specific Bypass application for `/public/*`; Cloudflare evaluates the more
specific path before the hostname default. Do not bypass `/api/*`, `/mcp`, `/`,
or `/plans/*`.

Set `CF_ACCESS_AUDIENCE` to the MCP application audience and
`CF_ACCESS_BROWSER_AUDIENCE` to the hostname-default browser application audience.
The public bypass has no trusted identity. Keep both protected applications on
the same Access team issuer.

The origin repeats the decision. Anonymous requests can read only a published
plan's current HTML, JSON document, current referenced assets, and update events
under `/public/plans/{ownerId}/{planId}/*`. An unpublished or private-repository
plan returns the same generic unavailable response. Private JSON, asset, and
event routes still require a valid Access identity at the origin. Shared caches
may cache public responses only; private responses use `private, no-store`.
Plan documents and plan-bound assets use `public, no-cache`, so every reuse
revalidates current publication and asset membership. Only content-hashed generic
client runtime files use long immutable caching.

See `examples/cloudflare-access-policies.json` for a credential-free path and
policy example. Confirm that Bypass and Service Auth are available in the
selected Cloudflare Zero Trust subscription during deployment.

## Storage and startup

Mount a persistent writable volume at `/data`. The service applies the committed generated SQL migrations before it becomes ready. `SIGINT` and `SIGTERM` stop readiness, wait for active HTTP requests, and exit within ten seconds.

- `GET /healthz` reports that the process accepts HTTP.
- `GET /readyz` reports whether migrations and owner configuration completed.
- `GET /` lists plans for an authenticated browser owner.
- `GET /plans/{planId}` and `/plans/{planId}/items/{itemId}` serve the review application.
- `GET /api/plans/{planId}/events` is the private live-update stream. It rechecks authentication before each revision notice.

## Container image

Build the ordinary image:

```bash
docker build -t irudd-plan:local .
```

Verify or build the Linux ARM64 path used by a Raspberry Pi:

```bash
docker buildx build --platform linux/arm64 -t irudd-plan:arm64 --load .
```

Run it with a persistent volume and an environment file held outside the repository:

```bash
docker volume create irudd-plan-data
docker run -d --name irudd-plan --restart unless-stopped -p 127.0.0.1:3000:3000 \
  --env-file /secure/path/irudd-plan.env \
  -v irudd-plan-data:/data \
  irudd-plan:arm64
```

The build and dependency stages use the pinned Vite+ image. Vite+ provisions
the Node.js and pnpm versions declared by the project, runs the checks and
build, then exports the resolved Node.js binary. The final Debian image contains
that binary, the built service, and production dependencies. It runs as an
unprivileged user, has a readiness health check, and stores no credentials in
its layers.

## Retention and permanent deletion

The server checks due plans on startup and runs another bounded batch of 20
plans every minute. Each completed check persists its next daily check date in
SQLite. A restart picks up pending work without relying on an in-memory queue.

A plan with no attached GitHub work expires 30 days after creation. Reading,
editing and retrying writes do not renew that period. Attached plans remain
while any linked issue or PR is open, including draft PRs. Once all links are
inactive, the expiry date is 30 days after the latest verified closure time.
Reopening cancels expiry, and the next closure starts a new period.

Missing credentials, inaccessible repositories or work, rate limits, network
failures, changed GitHub identities and missing closure dates retain content.
Owners see the reason and last/next check dates. GitHub may return 404 for
inaccessible private resources, so 404 never proves closure. See
[GitHub's REST troubleshooting guide](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#404-not-found-for-an-existing-resource).

Before deleting an attached plan, the service repeats verification. A concurrent
accepted attachment or update invalidates the deletion attempt. SQLite commits
the deleted-ID record, plan/revision/association cleanup and owned asset-byte
cleanup together. An interrupted transaction rolls back and is retried. Asset
objects belong to an exact owner and plan; identical bytes uploaded for another
plan remain stored separately.

Once deleted, content is lost. v1 provides no backup, archive or recovery.
Deleted plan IDs stay reserved within their owner, so uncertain retries and old
URLs cannot resolve to replacement content. Small deleted-ID records and write
receipts remain for this purpose; they contain no plan or asset content. Old
public URLs report unavailability without private retention details. The service
never edits the short goal or any other GitHub issue or PR content.

On upgrade, existing linked plans start with unknown retention status until
verified. Existing never-attached plans retain their original creation date and
may therefore be immediately due. Stop old server processes before applying the
migration; old binaries do not enforce deleted-ID reservations.

## Pi commissioning commands

Use a 64-bit Pi OS and build on the Pi, or transfer the ARM64 image from a
buildx-capable host. Confirm the image before starting it:

```sh
uname -m
docker image inspect irudd-plan:arm64 --format '{{.Os}}/{{.Architecture}}'
```

Expected values are `aarch64` and `linux/arm64`. The named `/data` volume stores
SQLite records, revisions and asset bytes together. A fresh named volume inherits
the image directory's UID 65534 ownership. For an existing bind mount, arrange
writable ownership for UID/GID 65534 before startup. Do not mount an empty
non-writable host directory and assume the image will repair its permissions.

The environment file for `docker --env-file` uses raw `NAME=value` lines, without
shell quote wrappers. In particular keep OWNER_MAPPINGS_JSON on one raw JSON
line. `.env.example` is for shell sourcing and its quote wrappers must be removed
when making the Docker env file. Set HOST=0.0.0.0 and DATABASE_PATH=/data/irudd-plan.db
inside the container. Encode newlines in GITHUB_APP_PRIVATE_KEY as literal `\n`;
the service restores them. Keep the file outside the checkout and mode 0600.

Route the chosen hostname through cloudflared to `http://127.0.0.1:3000` when
cloudflared runs on the host. For a containerized tunnel, use a private Docker
network and the service container's port instead. Do not publish an unauthenticated
origin port on the public network. Cloudflare policy examples are descriptive
dashboard inputs, not an API payload to upload unchanged. Choose Service Auth
with Include Service Token for the exact token; use Allow with Include Emails
for the owner and One-time PIN as the identity provider on the browser app. Use
Bypass with Include Everyone only on `/public/*`.

[Cloudflare service token documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
describes the Service Auth policy and two client headers. The verified service
token [application claim](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
`common_name` is the client ID, not the token's display name. The
[GitHub App permission guide](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
explains installation permissions; this service needs only read access.

```sh
curl --fail http://127.0.0.1:3000/readyz
docker inspect irudd-plan --format '{{.State.Health.Status}}'
docker exec irudd-plan sh -c 'test -w /data && test -f /data/irudd-plan.db'
docker restart irudd-plan
curl --retry 10 --retry-connrefused --retry-delay 1 --fail http://127.0.0.1:3000/readyz
```

Run the [MCP/browser smoke commands](smoke-tests.md) and install the
[Codex skill/configuration](../skills/irudd-plan/references/setup.md). Health
checks do not prove Cloudflare access, asset retrieval, GitHub permissions or
Codex behavior. Reserve their observed deployment results for the operator
trial; no live deployment is certified by these instructions.
