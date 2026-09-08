# Preview the development fixture over Tailscale

The browser fixture runs the real client and server with sample plans and a disposable SQLite database. It binds to loopback and uses test authentication. Its published sample route works without adding authentication headers in a browser.

Build the current client, then start the fixture on an unused port:

```sh
vp run build:client
BROWSER_PORT=4175 vp run test:browser:server
```

In a persistent session or a detached process, keep that server running while the preview is in use. Rebuild the client and refresh the browser after edits. The fixture does not watch or rebuild the client automatically. Keep Playwright's default port 4173 separate so tests can create their own fixture.

Inspect the existing Tailscale configuration before adding a route:

```sh
tailscale serve status --json
sudo tailscale serve --bg --https=8443 http://127.0.0.1:4175
```

Choose an unused HTTPS port. Do not replace an existing service or reset Serve. Open the resulting hostname at `/public/plans/owner-a/browser-plan`. A Mac on the same tailnet can open that HTTPS URL. This uses Tailscale Serve, not Funnel. The test fixture contains sample data and must not use a production database or production credentials.

Verify the HTTPS page and its assets before sharing the link. Keep the fixture and route running while awaiting review. When review ends, remove only the route created for this preview, then stop its recorded server process:

```sh
sudo tailscale serve --https=8443 off
```

Check that the fixture process has exited and that the route is gone. Existing Serve routes must remain intact.
