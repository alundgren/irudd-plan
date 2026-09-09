import { handlePlanningRequest } from "./planning-router.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";

import type { Authenticator } from "../auth/authentication.js";
import { PlanError } from "../contract/errors.js";
import type { PlanService } from "../domain/plan-service.js";
import type { PlanUpdate } from "../domain/plan-update-hub.js";
import { renderAppPage } from "./operator-page.js";

interface BrowserRouterOptions {
  readonly authenticator: Authenticator;
  readonly clientAssetsDirectory: string;
  readonly registerStreamClose: (close: () => void) => () => void;
}

export async function handleBrowserRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: PlanService,
  options: BrowserRouterOptions,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && isClientAsset(url.pathname)) {
    await serveClientAsset(
      response,
      options.clientAssetsDirectory,
      url.pathname,
    );
    return true;
  }
  if (
    await handlePlanningRequest(
      request,
      response,
      service,
      options.authenticator,
      url,
    )
  )
    return true;
  if (request.method !== "GET") return false;

  if (await handlePublicRequest(request, response, service, options, url)) {
    return true;
  }

  if (url.pathname === "/" || isPlanPage(url.pathname)) {
    await options.authenticator.authenticate(request.headers);
    sendHtml(response, await renderAppPage(options.clientAssetsDirectory));
    return true;
  }

  if (url.pathname === "/api/plans") {
    const ownerId = await options.authenticator.authenticate(request.headers);
    sendJson(response, 200, { plans: await service.list(ownerId) });
    return true;
  }

  const eventMatch = url.pathname.match(/^\/api\/plans\/([^/]+)\/events$/);
  if (eventMatch?.[1] !== undefined) {
    const planId = decodeURIComponent(eventMatch[1]);
    await subscribe(
      request,
      response,
      service,
      options.authenticator,
      options.registerStreamClose,
      planId,
    );
    return true;
  }

  const assetMatch = url.pathname.match(
    /^\/api\/plans\/([^/]+)\/assets\/([^/]+)$/,
  );
  if (assetMatch?.[1] !== undefined && assetMatch[2] !== undefined) {
    const ownerId = await options.authenticator.authenticate(request.headers);
    const asset = await service.getAsset(ownerId, {
      contractVersion: "v1",
      planId: decodeURIComponent(assetMatch[1]),
      assetId: decodeURIComponent(assetMatch[2]),
      digest: url.searchParams.get("digest") ?? "",
      content: "rendered",
    });
    sendBrowserAsset(response, asset.mediaType, asset.bytesBase64, false);
    return true;
  }

  const planMatch = url.pathname.match(/^\/api\/plans\/([^/]+)$/);
  if (planMatch?.[1] !== undefined) {
    const ownerId = await options.authenticator.authenticate(request.headers);
    const stored = await service.current(
      ownerId,
      decodeURIComponent(planMatch[1]),
    );
    if (stored === undefined) {
      throw new PlanError("PLAN_NOT_FOUND", "Plan is unavailable");
    }
    sendJson(response, 200, {
      ...stored,
      feedbackScope: feedbackScope(ownerId),
    });
    return true;
  }
  return false;
}

async function handlePublicRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: PlanService,
  options: BrowserRouterOptions,
  url: URL,
): Promise<boolean> {
  const route = publicRoute(url.pathname);
  if (route === undefined) return false;
  if (route.kind === "page") {
    const current = await service.publicCurrent(route.ownerId, route.planId);
    if (current === undefined) throw publicUnavailable();
    sendHtml(
      response,
      await renderAppPage(options.clientAssetsDirectory, true),
      "public, no-cache",
    );
  } else if (route.kind === "events") {
    await subscribePublic(
      request,
      response,
      service,
      options.registerStreamClose,
      route.ownerId,
      route.planId,
    );
  } else if (route.kind === "asset") {
    const asset = await service.publicAsset(
      route.ownerId,
      route.planId,
      route.assetId ?? "",
      url.searchParams.get("digest") ?? "",
    );
    sendBrowserAsset(response, asset.mediaType, asset.bytesBase64, true);
  } else {
    const stored = await service.publicCurrent(route.ownerId, route.planId);
    if (stored === undefined) throw publicUnavailable();
    sendJson(
      response,
      200,
      {
        plan: stored.plan,
        version: stored.version,
        access: stored.access,
        feedbackScope: feedbackScope(`public:${route.ownerId}`),
      },
      "public, no-cache",
    );
  }
  return true;
}

type PublicRoute = {
  readonly kind: "page" | "events" | "asset" | "document";
  readonly ownerId: string;
  readonly planId: string;
  readonly assetId?: string;
};

function publicRoute(pathname: string): PublicRoute | undefined {
  const match = pathname.match(
    /^\/public\/plans\/([^/]+)\/([^/]+)(?:\/(events|document|assets\/([^/]+)|items\/[^/]+))?$/,
  );
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  const suffix = match[3];
  const kind =
    suffix === "events"
      ? "events"
      : suffix === "document"
        ? "document"
        : match[4] === undefined
          ? "page"
          : "asset";
  return {
    kind,
    ownerId: decodeURIComponent(match[1]),
    planId: decodeURIComponent(match[2]),
    ...(match[4] === undefined
      ? {}
      : { assetId: decodeURIComponent(match[4]) }),
  } as PublicRoute;
}

async function subscribePublic(
  request: IncomingMessage,
  response: ServerResponse,
  service: PlanService,
  registerStreamClose: (close: () => void) => () => void,
  ownerId: string,
  planId: string,
): Promise<void> {
  const current = await service.publicCurrent(ownerId, planId);
  if (current === undefined) throw publicUnavailable();
  const stream = openStream(response, current.version, registerStreamClose);
  const unsubscribe = service.updates.subscribe(ownerId, planId, (update) => {
    void service
      .publicCurrent(ownerId, planId)
      .then((latest) => {
        if (latest === undefined) return stream.close();
        stream.send(update.version);
      })
      .catch(stream.close);
  });
  stream.setUnsubscribe(unsubscribe);
  request.on("close", stream.close);
}

function openStream(
  response: ServerResponse,
  version: number,
  registerStreamClose: (close: () => void) => () => void,
) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "public, no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.write(`event: ready\ndata: ${JSON.stringify({ version })}\n\n`);
  let closed = false;
  let unsubscribe = (): void => undefined;
  const unregister = registerStreamClose(close);
  const heartbeat = setInterval(
    () => response.write(": keepalive\n\n"),
    15_000,
  );
  heartbeat.unref();
  function close(): void {
    if (closed) return;
    closed = true;
    unsubscribe();
    unregister();
    clearInterval(heartbeat);
    if (!response.writableEnded) response.end();
  }
  return {
    close,
    send(nextVersion: number): void {
      response.write(
        `id: ${nextVersion}\nevent: plan-update\ndata: ${JSON.stringify({ version: nextVersion })}\n\n`,
      );
    },
    setUnsubscribe(value: () => void): void {
      unsubscribe = value;
    },
  };
}

function feedbackScope(ownerId: string): string {
  return createHash("sha256")
    .update(`irudd-plan-browser-feedback\0${ownerId}`)
    .digest("base64url");
}

async function subscribe(
  request: IncomingMessage,
  response: ServerResponse,
  service: PlanService,
  authenticator: Authenticator,
  registerStreamClose: (close: () => void) => () => void,
  planId: string,
): Promise<void> {
  const ownerId = await authenticator.authenticate(request.headers);
  const current = await service.current(ownerId, planId);
  if (current === undefined) {
    throw new PlanError("PLAN_NOT_FOUND", "Plan is unavailable");
  }
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.write(
    `event: ready\ndata: ${JSON.stringify({ version: current.version })}\n\n`,
  );

  let closed = false;
  let heartbeat: NodeJS.Timeout | undefined;
  let unsubscribe = (): void => undefined;
  let unregisterStream = (): void => undefined;
  const close = (): void => {
    if (closed) return;
    closed = true;
    unsubscribe();
    unregisterStream();
    if (heartbeat !== undefined) clearInterval(heartbeat);
    if (!response.writableEnded) response.end();
  };
  const deliver = async (update: PlanUpdate): Promise<void> => {
    try {
      const currentOwner = await authenticator.authenticate(request.headers);
      if (currentOwner !== ownerId) return close();
      const latest = await service.current(currentOwner, planId);
      if (latest === undefined) return close();
      response.write(
        `id: ${update.version}\nevent: plan-update\ndata: ${JSON.stringify({ version: update.version })}\n\n`,
      );
    } catch {
      close();
    }
  };
  unsubscribe = service.updates.subscribe(ownerId, planId, (update) => {
    void deliver(update);
  });
  unregisterStream = registerStreamClose(close);
  heartbeat = setInterval(() => response.write(": keepalive\n\n"), 15_000);
  heartbeat.unref();
  request.on("close", close);
}

function isPlanPage(pathname: string): boolean {
  return /^\/plans\/[^/]+(?:\/items\/[^/]+)?$/.test(pathname);
}

function isClientAsset(pathname: string): boolean {
  return /^\/(?:public\/)?assets\/[A-Za-z0-9._-]+$/.test(pathname);
}

async function serveClientAsset(
  response: ServerResponse,
  directory: string,
  pathname: string,
): Promise<void> {
  const filename = pathname.slice(pathname.lastIndexOf("/") + 1);
  try {
    const content = await readFile(join(directory, filename));
    response.writeHead(200, {
      "content-type": clientAssetMediaType(filename),
      "content-length": content.byteLength,
      "cache-control": /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(filename)
        ? "public, max-age=31536000, immutable"
        : "no-cache, must-revalidate",
      ...(filename.startsWith("mockup-worker-")
        ? {
            "content-security-policy":
              "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'none'",
          }
        : {}),
    });
    response.end(content);
  } catch {
    sendJson(response, 503, { error: "Browser application is not built" });
  }
}

function clientAssetMediaType(filename: string): string {
  if (filename.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filename.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function sendAsset(
  response: ServerResponse,
  mediaType: string,
  content: Buffer,
  cacheControl = "private, no-store",
): void {
  response.writeHead(200, {
    "content-type": mediaType,
    "content-length": content.byteLength,
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
  });
  response.end(content);
}

function sendBrowserAsset(
  response: ServerResponse,
  mediaType: string,
  bytesBase64: string,
  isPublic: boolean,
): void {
  if (isActiveMarkup(mediaType)) {
    sendJson(
      response,
      200,
      { mediaType, bytesBase64 },
      isPublic ? "public, no-cache" : "private, no-store",
    );
    return;
  }
  sendAsset(
    response,
    mediaType,
    Buffer.from(bytesBase64, "base64"),
    isPublic ? "public, no-cache" : "private, no-store",
  );
}

function isActiveMarkup(mediaType: string): boolean {
  return mediaType === "text/html" || mediaType === "image/svg+xml";
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  cacheControl = "private, no-store",
): void {
  const content = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(content),
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
  });
  response.end(content);
}

function sendHtml(
  response: ServerResponse,
  body: string,
  cacheControl = "private, no-store",
): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": cacheControl,
  });
  response.end(body);
}

function publicUnavailable(): PlanError {
  return new PlanError("PLAN_NOT_FOUND", "Public plan is unavailable");
}
