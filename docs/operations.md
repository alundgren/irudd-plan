# Operations

## Configuration

The service reads configuration from environment variables. Keep real values in the deployment secret store, not Git.

| Variable                        | Purpose                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_PATH`                 | SQLite file. Production defaults to `/data/irudd-plan.db`.                      |
| `MIGRATIONS_DIR`                | Generated migration history. The image uses `/app/drizzle`.                     |
| `HOST`, `PORT`                  | HTTP listener.                                                                  |
| `REQUEST_BODY_LIMIT_BYTES`      | Maximum JSON-RPC request size. Defaults to 12,000,000 bytes.                    |
| `MAX_ASSET_BYTES`               | Maximum decoded rendered asset size. Defaults to 5,000,000 bytes.               |
| `MAX_ASSET_SOURCE_BYTES`        | Maximum decoded source-file size. Defaults to 2,000,000 bytes.                  |
| `MAX_OWNER_ASSET_STORAGE_BYTES` | Maximum stored asset and source bytes per owner. Defaults to 100,000,000 bytes. |
| `CLIENT_ASSETS_DIR`             | Built browser asset directory. Defaults to `dist/client/assets`.                |
| `CF_ACCESS_ISSUER`              | Exact Access team issuer, without a trailing slash.                             |
| `CF_ACCESS_AUDIENCE`            | Access application audience.                                                    |
| `CF_ACCESS_JWKS_URL`            | Team certificate endpoint. Defaults from the issuer.                            |
| `OWNER_MAPPINGS_JSON`           | Operator-managed mappings from verified claims to internal owners.              |

A service mapping normally uses the token `common_name`. A browser mapping can use `email` or `sub`. Set `kind` explicitly. Several mappings may point to one owner. MCP accepts only `service` mappings, while browser pages, JSON reads, asset reads, and update subscriptions accept only `browser` mappings.

Cloudflare must validate the service token at the protected application before it forwards the signed assertion. The origin still checks the JWT signature, issuer, audience, and expiry. Unknown verified identities receive no owner access.

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
