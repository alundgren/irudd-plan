# Operations

## Configuration

The service reads configuration from environment variables. Keep real values in the deployment secret store, not Git.

| Variable                          | Purpose                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_PATH`                   | SQLite file. Production defaults to `/data/irudd-plan.db`.                      |
| `MIGRATIONS_DIR`                  | Generated migration history. The image uses `/app/drizzle`.                     |
| `HOST`, `PORT`                    | HTTP listener.                                                                  |
| `REQUEST_BODY_LIMIT_BYTES`        | Maximum JSON-RPC request size. Defaults to 12,000,000 bytes.                    |
| `MAX_ASSET_BYTES`                 | Maximum decoded rendered asset size. Defaults to 5,000,000 bytes.               |
| `MAX_ASSET_SOURCE_BYTES`          | Maximum decoded source-file size. Defaults to 2,000,000 bytes.                  |
| `MAX_OWNER_ASSET_STORAGE_BYTES`   | Maximum stored asset and source bytes per owner. Defaults to 100,000,000 bytes. |
| `CLIENT_ASSETS_DIR`               | Built browser asset directory. Defaults to `dist/client/assets`.                |
| `CF_ACCESS_ISSUER`                | Exact Access team issuer, without a trailing slash.                             |
| `CF_ACCESS_AUDIENCE`              | Access application audience.                                                    |
| `CF_ACCESS_JWKS_URL`              | Team certificate endpoint. Defaults from the issuer.                            |
| `OWNER_MAPPINGS_JSON`             | Operator-managed mappings from verified claims to internal owners.              |
| `PUBLIC_BASE_URL`                 | External HTTPS origin used in stable published links.                           |
| `GITHUB_APP_ID`                   | Numeric ID of the read-only GitHub App.                                         |
| `GITHUB_APP_PRIVATE_KEY`          | PEM private key supplied by the deployment secret store.                        |
| `OWNER_GITHUB_INSTALLATIONS_JSON` | Owner-to-installation and repository allowlist described below.                 |
| `GITHUB_API_URL`                  | Optional GitHub API origin. Defaults to `https://api.github.com`.               |

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
docker run --rm -p 3000:3000 \
  --env-file /secure/path/irudd-plan.env \
  -v irudd-plan-data:/data \
  irudd-plan:local
```

The build and dependency stages use the pinned Vite+ image. Vite+ provisions
the Node.js and pnpm versions declared by the project, runs the checks and
build, then exports the resolved Node.js binary. The final Debian image contains
that binary, the built service, and production dependencies. It runs as an
unprivileged user, has a readiness health check, and stores no credentials in
its layers.
